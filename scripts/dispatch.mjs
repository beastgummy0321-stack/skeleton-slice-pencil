import { mkdtempSync, mkdirSync, rmdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

const fail = (message, code = 2) => ({ ok: false, code, message });
class GateError extends Error {}
const normalize = (value) => String(value).replace(/\\/g, '/').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lineCount = (path) => {
  const content = readFileSync(path, 'utf8').replace(/(?:\r?\n)+$/, '');
  return content ? content.split(/\r?\n/).length : 0;
};

const ROLE_CONFIG = {
  impl: { model: 'gpt-5.6-terra', sandbox: 'workspace-write', effort: 'high' },
  review: { model: 'gpt-5.6-sol', sandbox: 'read-only', effort: 'high' },
  scout: { model: 'gpt-5.6-luna', sandbox: 'read-only', effort: 'low' },
};

const COMMON_PREFIX = '本次為 exec 派工：禁跑 orca 指令；不得 git commit、git push；npm 用 npm.cmd。';

function effortPath(cwd, effort) {
  if (effort) return join(cwd, '.scratch', effort);
  const scratch = join(cwd, '.scratch');
  const choices = existsSync(scratch) ? readdirSync(scratch).filter((name) => existsSync(join(scratch, name, 'pipeline.json'))) : [];
  if (choices.length === 1) return join(scratch, choices[0]);
  throw new Error('--effort is required when .scratch has no unique pipeline');
}

// 鎖：mkdir 是原子操作，50 次 * 100ms 逾時就放棄——契約定案值，不做測試專用捷徑。
const LOCK_RETRIES = 50;
const LOCK_DELAY_MS = 100;
async function withLock(scratch, fn) {
  const lockDir = join(scratch, 'pipeline.lock');
  let acquired = false;
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try { mkdirSync(lockDir); acquired = true; break; } catch (error) { if (error.code !== 'EEXIST') throw error; await sleep(LOCK_DELAY_MS); }
  }
  if (!acquired) throw new Error(`pipeline.lock 逾時：重試 ${LOCK_RETRIES} 次後放棄`);
  try { return await fn(); } finally { try { rmdirSync(lockDir); } catch { /* best-effort release */ } }
}

// 沿用 v2.5 語意的閘門，回傳訊息字串代表拒派；null 代表通過。
function checkGates({ pipeline, tickets, ticket, ticketPath, role, redispatch }) {
  if (pipeline.approved !== true) return '凍結閘：pipeline.json approved!=true';
  try { if (lineCount(ticketPath) > 150) return '票太大，回 /to-tickets 重切'; } catch { return `派工閘：票檔不存在 ${ticket.file}`; }

  if (role === 'impl') {
    const accepted = ticket.status === 'pending' || (ticket.status === 'rejected' && redispatch);
    if (!accepted) return `派工閘：票 ${ticket.id} 狀態為 ${ticket.status}`;
    // v3 沒有 dispatch_id，改用 exit 落盤紀錄當「已派過工」的訊號：pending 卻已有 exit 代表狀態被手動撥回，不得重派。
    if (ticket.status === 'pending' && ticket.exit) return `派工閘：票 ${ticket.id} 已有派工紀錄`;
    const blocked = (ticket.blocked_by ?? []).filter((id) => tickets.find((item) => item.id === id)?.status !== 'merged');
    if (blocked.length) return `派工閘：票 ${ticket.id} 的擋票未全部合併：${blocked.join('、')}`;
    const shared = new Set((ticket.shared_files ?? []).map(normalize));
    for (const other of tickets) {
      if (other === ticket || !['dispatched', 'approved', 'merging'].includes(other.status)) continue;
      const overlap = (other.shared_files ?? []).map(normalize).filter((path) => shared.has(path));
      if (overlap.length) return `派工閘：票 ${ticket.id} 與在飛票 ${other.id} 共用檔重疊：${overlap.join('、')}`;
      if (ticket.migration && other.migration) return `派工閘：帶 migration 的票同時只准一張在飛（票 ${other.id}）`;
    }
    if (!ticket.branch) return `派工閘：票 ${ticket.id} 缺 branch 欄，無法具名 worktree 隔離`;
  } else {
    const statusGate = role === 'review' ? 'dispatched' : 'pending';
    if (ticket.status !== statusGate) return `派工閘：${role} 需要票 ${ticket.id} 狀態為 ${statusGate}，現為 ${ticket.status}`;
  }
  return null;
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} 失敗：${(result.stderr || result.error?.message || '').trim().split(/\r?\n/)[0]}`);
  return (result.stdout || '').trim();
}
function branchExists(projectRoot, branch) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: projectRoot, encoding: 'utf8' }).status === 0;
}

// worktree 生命週期：impl 建立／附掛，review／scout 只驗存在。
function setupWorktree({ projectRoot, branch, base, role }) {
  const worktreePath = join(projectRoot, '.worktrees', branch);
  if (role !== 'impl') {
    if (!existsSync(worktreePath)) throw new Error(`worktree 不存在：${worktreePath}`);
    return worktreePath;
  }
  if (!existsSync(worktreePath)) {
    if (branchExists(projectRoot, branch)) git(['worktree', 'add', worktreePath, branch], projectRoot);
    else git(['worktree', 'add', '-b', branch, worktreePath, base], projectRoot);
  } else {
    const behind = git(['rev-list', '--count', `HEAD..${base}`], worktreePath);
    if (Number(behind) !== 0) throw new Error(`worktree 基準落後：HEAD..${base} 尚有 ${behind} 個提交（workflow.md 九）`);
  }
  return worktreePath;
}

function buildSpec({ role, round, ticketPath, reportPath, reviewsPath, prescanPath }) {
  if (role === 'impl') {
    const reviewPrefix = round >= 2 ? `先讀 ${reviewsPath}；` : '';
    return `${COMMON_PREFIX}讀 ${ticketPath} 後開工；${reviewPrefix}完整報告寫入 ${reportPath}；交件前逐條自核票面驗收清單，報告附對照表；最後回覆只准兩行：結論一行＋報告檔路徑一行。`;
  }
  if (role === 'review') {
    const reviewPrefix = round >= 2 ? `只驗 ${reviewsPath} 已列退件項＋一項本輪新破壞檢查；` : '';
    return `${COMMON_PREFIX}你在唯讀沙箱中審查，不得改碼；讀 ${ticketPath} 與 ${reportPath}；${reviewPrefix}不重跑完整套件，測試結果引用交件方報告並註明是引用；審查報告寫入 ${reviewsPath}；最後回覆只准兩行：通過或退件一行＋報告檔路徑一行。`;
  }
  return `${COMMON_PREFIX}讀 ${ticketPath}；唯讀預掃受影響檔，摘要一頁寫入 ${prescanPath}；最後回覆只准兩行。`;
}

function buildArgs({ role, cfg, worktreePath, addDirPath, lastMessagePath, spec }) {
  const args = ['exec', '-m', cfg.model, '-s', cfg.sandbox, '-C', worktreePath, '--skip-git-repo-check', '-c', `model_reasoning_effort="${cfg.effort}"`];
  if (role === 'impl') args.push('--add-dir', addDirPath);
  args.push('-o', lastMessagePath, spec);
  return args;
}

function defaultSpawn(args) {
  return spawn(process.env.CODEX_EXEC_BIN || 'codex', args, { stdio: 'ignore' });
}

// 逾時 kill 子行程；成功／失敗／逾時三路徑都收斂到同一個 {code, timedOut, durationS}。
function runChild(spawnFn, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    let child;
    try { child = spawnFn(args); } catch (error) { resolvePromise({ code: 1, timedOut: false, durationS: 0, error: error.message }); return; }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* 行程可能已結束 */ } }, timeoutMs);
    const finish = (code, error) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, timedOut, durationS: (Date.now() - startedAt) / 1000, error });
    };
    child.on('exit', (code) => finish(code));
    child.on('error', (error) => finish(1, error.message));
  });
}

export async function dispatch({ cwd, effort, ticketId, role = 'impl', redispatch = false, timeoutMs = 3600000, spawnFn = defaultSpawn }) {
  if (!['impl', 'review', 'scout'].includes(role)) return fail('--role 必須是 impl｜review｜scout');
  let scratch;
  try { scratch = effortPath(cwd, effort); } catch (error) { return fail(error.message); }
  const pipelinePath = join(scratch, 'pipeline.json');

  let started;
  try {
    started = await withLock(scratch, async () => {
      let pipeline;
      try { pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')); } catch { throw new GateError('找不到或無法讀取 pipeline.json'); }
      const tickets = pipeline.tickets ?? [];
      const ticket = tickets.find((item) => String(item.id) === String(ticketId));
      if (!ticket) throw new GateError(`派工閘：pipeline.json 查無票 ${ticketId}`);
      const ticketPath = resolve(scratch, ticket.file);
      const gateError = checkGates({ pipeline, tickets, ticket, ticketPath, role, redispatch });
      if (gateError) throw new GateError(gateError);

      const base = pipeline.base || 'master';
      const worktreePath = setupWorktree({ projectRoot: cwd, branch: ticket.branch, base, role });

      const round = role === 'impl'
        ? (ticket.status === 'rejected' ? Number(ticket.round || 1) + 1 : Number(ticket.round || 1))
        : Number(ticket.round || 1);

      // -o／報告路徑都落在 reports／reviews 下，先確保目錄存在（codex／worker 才寫得進去）。
      mkdirSync(join(scratch, 'reports'), { recursive: true });
      mkdirSync(join(scratch, 'reviews'), { recursive: true });

      const reportPath = join(scratch, 'reports', `${ticket.id}-r${round}.md`);
      const reviewsPath = join(scratch, 'reviews', `${ticket.id}.md`);
      const prescanPath = join(scratch, 'reports', `${ticket.id}-prescan.md`);
      const lastMessagePath = join(scratch, 'reports', `${ticket.id}-r${round}-${role}-last.txt`);
      const spec = buildSpec({ role, round, ticketPath, reportPath, reviewsPath, prescanPath });
      const cfg = ROLE_CONFIG[role];
      const addDirPath = role === 'impl' ? join(cwd, '.git', 'worktrees', ticket.branch) : null;
      const args = buildArgs({ role, cfg, worktreePath, addDirPath, lastMessagePath, spec });

      if (role === 'impl') { ticket.status = 'dispatched'; ticket.round = round; }
      else if (role === 'review') { ticket.review_round = Number(ticket.review_round || 0) + 1; }
      else { ticket.scout_round = Number(ticket.scout_round || 0) + 1; }
      writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);

      const report = role === 'impl' ? reportPath : role === 'review' ? reviewsPath : prescanPath;
      return { args, round, report, lastMessagePath };
    });
  } catch (error) {
    if (error instanceof GateError) return fail(error.message, 2);
    return fail(error.message, 1);
  }

  const { args, round, report, lastMessagePath } = started;
  const runResult = await runChild(spawnFn, args, timeoutMs);
  let lastMessage = '';
  try { lastMessage = readFileSync(lastMessagePath, 'utf8').trim(); } catch { /* codex 未寫出 last-message 檔 */ }

  // end 落盤：獨立取鎖，不把長跑子行程夾在鎖內。
  // ponytail: 落盤失敗只吞掉、不覆蓋子行程已跑完的結果——重試/告警留待需要時再加。
  try {
    await withLock(scratch, async () => {
      const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8'));
      const ticket = (pipeline.tickets ?? []).find((item) => String(item.id) === String(ticketId));
      if (ticket) {
        ticket.exit = { role, round, code: runResult.code, timed_out: runResult.timedOut, duration_s: runResult.durationS, last_message: lastMessage };
        writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);
      }
    });
  } catch { /* best-effort */ }

  return { ok: true, ticket: String(ticketId), role, round, code: runResult.code, timed_out: runResult.timedOut, report, last_message: lastMessage };
}

function parseArgs(args) {
  const options = { cwd: process.cwd(), redispatch: false, role: 'impl', timeoutMs: 3600000 };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--ticket') options.ticketId = args[++index];
    if (args[index] === '--cwd') options.cwd = args[++index];
    if (args[index] === '--effort') options.effort = args[++index];
    if (args[index] === '--redispatch') options.redispatch = true;
    if (args[index] === '--role') options.role = args[++index];
    if (args[index] === '--timeout-ms') options.timeoutMs = Number(args[++index]);
  }
  return options;
}

async function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'dispatch-test-'));
  try {
    await runSelfTestBody(root);
    process.stdout.write('dispatch self-test passed\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

async function runSelfTestBody(root) {
  const scratch = join(root, '.scratch', 'x');
  mkdirSync(join(scratch, 'issues'), { recursive: true });
  const issue = join(scratch, 'issues', '01.md');
  const pipelinePath = join(scratch, 'pipeline.json');
  const baseTicket = () => ({ id: '01', file: 'issues/01.md', status: 'pending', branch: 'feature-01', blocked_by: [], shared_files: [], migration: null, round: 1 });
  const writePipeline = (changes = {}) => {
    const ticket = { ...baseTicket(), ...(changes.ticket ?? {}) };
    const pipeline = { mode: 'dual', approved: true, tickets: [ticket], ...(changes.pipeline ?? {}) };
    writeFileSync(pipelinePath, JSON.stringify(pipeline));
    return pipeline;
  };
  const failingSpawn = () => { throw new Error('拒派案不得呼叫 spawn'); };
  const expectRejected = async (name, changes, extra = {}) => {
    writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
    writePipeline(changes);
    const outcome = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: failingSpawn, ...extra });
    if (outcome.ok || outcome.code !== 2) throw new Error(`${name} 未拒派`);
  };

  // ---- 驗收 1：拒派閘各一案，exit 2、不呼叫 spawn ----
  await expectRejected('未點頭', { pipeline: { approved: false } });
  await expectRejected('非 pending', { ticket: { status: 'approved' } });
  await expectRejected('擋票未合', { ticket: { blocked_by: ['02'] }, pipeline: { tickets: [{ ...baseTicket(), blocked_by: ['02'] }, { id: '02', status: 'pending' }] } });
  await expectRejected('共用檔重疊', { ticket: { shared_files: ['src/a.ts'] }, pipeline: { tickets: [{ ...baseTicket(), shared_files: ['src/a.ts'] }, { id: '02', status: 'dispatched', shared_files: ['src/a.ts'] }] } });
  await expectRejected('migration 雙飛', { ticket: { migration: 'm1' }, pipeline: { tickets: [{ ...baseTicket(), migration: 'm1' }, { id: '02', status: 'dispatched', migration: 'm1', shared_files: [] }] } });
  writeFileSync(issue, `${Array.from({ length: 151 }, () => '# ticket').join('\n')}\n`);
  writePipeline();
  const tooLong = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: failingSpawn });
  if (tooLong.ok || tooLong.code !== 2) throw new Error('151 行票未拒派');
  await expectRejected('pending 已有派工紀錄', { ticket: { exit: { role: 'impl', round: 1, code: 0 } } });
  await expectRejected('缺 branch 欄', { ticket: { branch: undefined } });
  await expectRejected('review 需 dispatched', { ticket: { status: 'pending' } }, { role: 'review' });
  await expectRejected('scout 需 pending', { ticket: { status: 'dispatched' } }, { role: 'scout' });

  // ---- 驗收 1（補）：票檔不存在／pipeline.json 查無票／--role 非法，各案 exit 2、不呼叫 spawn ----
  writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
  writePipeline();
  rmSync(issue);
  const missingFile = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: failingSpawn });
  if (missingFile.ok || missingFile.code !== 2) throw new Error('票檔不存在 未拒派');
  writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
  writePipeline();
  const missingTicket = await dispatch({ cwd: root, effort: 'x', ticketId: '99', spawnFn: failingSpawn });
  if (missingTicket.ok || missingTicket.code !== 2) throw new Error('pipeline.json 查無票 未拒派');
  const badRole = await dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'bogus', spawnFn: failingSpawn });
  if (badRole.ok || badRole.code !== 2) throw new Error('--role 非法 未拒派');

  // ---- 準備一個真的 git 專案，覆蓋 worktree 三分支＋成功派工／round≥2／redispatch／timeout ----
  git(['init', '-b', 'master'], root);
  git(['config', 'user.email', 'test@test.local'], root);
  git(['config', 'user.name', 'dispatch-test'], root);
  writeFileSync(join(root, 'README.md'), 'root\n');
  git(['add', 'README.md'], root);
  git(['commit', '-m', 'init'], root);

  // ---- 驗收 2＋7：impl 首次派工 = 新建 worktree（-b），旗標序逐字比對，SECRET 不進 spec ----
  writeFileSync(issue, 'SECRET ticket body\n');
  writePipeline();
  const calls1 = [];
  const stubExit = (child) => setTimeout(() => child.emit('exit', 0), 0);
  const makeStub = () => {
    return (args) => {
      calls1.push(args);
      const lastMessageIndex = args.indexOf('-o') + 1;
      writeFileSync(args[lastMessageIndex], 'impl 完工訊息\n');
      const child = new EventEmitter();
      child.kill = () => child.emit('exit', null, 'SIGKILL');
      stubExit(child);
      return child;
    };
  };
  const result1 = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: makeStub() });
  if (!result1.ok || result1.code !== 0) throw new Error('impl 首次派工失敗');
  const worktreePath1 = join(root, '.worktrees', 'feature-01');
  if (!existsSync(worktreePath1)) throw new Error('impl 首次派工未建立 worktree');
  // 驗收 7（新建）：只有 existsSync 不夠——實證分支名與起點才算真的驗過 `-b <branch> <路徑> <base>` 三個參數。
  const newBranchName1 = git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath1);
  if (newBranchName1 !== 'feature-01') throw new Error('新建 worktree 分支名不符（未用 -b <branch>）');
  const newAheadOfBase1 = git(['rev-list', '--count', 'master..HEAD'], worktreePath1);
  if (newAheadOfBase1 !== '0') throw new Error('新建 worktree 起點不是 base（未用 <base> 作為起點）');
  const spec1 = calls1[0][calls1[0].length - 1];
  if (spec1.includes('SECRET')) throw new Error('SECRET 票檔內容外洩到 spec');
  const reportPath1 = join(scratch, 'reports', '01-r1.md');
  const lastMessagePath1 = join(scratch, 'reports', '01-r1-impl-last.txt');
  const expectedArgs1 = [
    'exec', '-m', 'gpt-5.6-terra', '-s', 'workspace-write', '-C', worktreePath1, '--skip-git-repo-check',
    '-c', 'model_reasoning_effort="high"', '--add-dir', join(root, '.git', 'worktrees', 'feature-01'),
    '-o', lastMessagePath1,
    `${COMMON_PREFIX}讀 ${resolve(scratch, 'issues/01.md')} 後開工；完整報告寫入 ${reportPath1}；交件前逐條自核票面驗收清單，報告附對照表；最後回覆只准兩行：結論一行＋報告檔路徑一行。`,
  ];
  if (JSON.stringify(calls1[0]) !== JSON.stringify(expectedArgs1)) throw new Error('impl 旗標序不逐字相符');
  if (result1.last_message !== 'impl 完工訊息') throw new Error('last_message 未從檔案讀回');
  if (result1.report !== reportPath1) throw new Error('impl report 欄位不正確');

  // ---- 驗收 5：start/end 落盤欄位齊全 ----
  const savedAfterImpl = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
  if (savedAfterImpl.status !== 'dispatched' || savedAfterImpl.round !== 1) throw new Error('impl start 落盤欄位不全');
  if (!savedAfterImpl.exit || savedAfterImpl.exit.role !== 'impl' || savedAfterImpl.exit.round !== 1 || savedAfterImpl.exit.code !== 0 || savedAfterImpl.exit.timed_out !== false || typeof savedAfterImpl.exit.duration_s !== 'number' || savedAfterImpl.exit.last_message !== 'impl 完工訊息') {
    throw new Error('impl end 落盤 exit 欄位不全');
  }

  // ---- 驗收 5：stub 退出碼非零 → 記錄 code 且回傳非 0 ----
  writePipeline({ ticket: { status: 'pending' } });
  const nonZeroCalls = [];
  const nonZeroStub = (args) => {
    nonZeroCalls.push(args);
    const child = new EventEmitter();
    child.kill = () => child.emit('exit', null, 'SIGKILL');
    setTimeout(() => child.emit('exit', 3), 0);
    return child;
  };
  const nonZeroResult = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: nonZeroStub });
  if (!nonZeroResult.ok || nonZeroResult.code !== 3) throw new Error('非零退出碼未正確回報');
  const savedAfterNonZero = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
  if (savedAfterNonZero.exit.code !== 3) throw new Error('非零退出碼未落盤');

  // ---- 驗收 6：timeout 案 ----
  writePipeline({ ticket: { status: 'pending' } });
  let killed = false;
  const timeoutStub = (args) => {
    const child = new EventEmitter();
    child.kill = () => { killed = true; setTimeout(() => child.emit('exit', null, 'SIGKILL'), 0); };
    // 故意不主動 exit：模擬逾時掛住，只有被 kill 才會結束。
    return child;
  };
  const timeoutResult = await dispatch({ cwd: root, effort: 'x', ticketId: '01', spawnFn: timeoutStub, timeoutMs: 30 });
  if (!killed) throw new Error('逾時未呼叫 kill');
  if (!timeoutResult.timed_out) throw new Error('逾時未回報 timed_out:true');
  const savedAfterTimeout = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
  if (savedAfterTimeout.exit.timed_out !== true) throw new Error('逾時 timed_out 未落盤');

  // ---- 驗收 3＋8：redispatch round+1，round≥2 前綴，worktree 已存在＋基準符合 ----
  writePipeline({ ticket: { status: 'rejected', round: 1 } });
  const redispatchCalls = [];
  const redispatchResult = await dispatch({ cwd: root, effort: 'x', ticketId: '01', redispatch: true, spawnFn: (args) => { redispatchCalls.push(args); const child = new EventEmitter(); child.kill = () => child.emit('exit', null, 'SIGKILL'); setTimeout(() => child.emit('exit', 0), 0); return child; } });
  if (!redispatchResult.ok || redispatchResult.round !== 2) throw new Error('redispatch round 未加一');
  const spec2 = redispatchCalls[0][redispatchCalls[0].length - 1];
  const expectedReviewRef = `先讀 ${join(scratch, 'reviews', '01.md')}；`;
  if (!spec2.includes(expectedReviewRef)) throw new Error('impl round≥2 前綴不符合契約');

  // ---- 驗收 2：review／scout 旗標序、模型；round≥2 前綴 ----
  writePipeline({ ticket: { status: 'dispatched', round: 2 } });
  const reviewCalls = [];
  const reviewResult = await dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'review', spawnFn: (args) => { reviewCalls.push(args); const child = new EventEmitter(); child.kill = () => child.emit('exit', null, 'SIGKILL'); setTimeout(() => child.emit('exit', 0), 0); return child; } });
  if (!reviewResult.ok) throw new Error('review 派工失敗');
  const reviewSpec = reviewCalls[0][reviewCalls[0].length - 1];
  const reportPath2 = join(scratch, 'reports', '01-r2.md');
  const reviewsPath = join(scratch, 'reviews', '01.md');
  const expectedReviewSpec = `${COMMON_PREFIX}你在唯讀沙箱中審查，不得改碼；讀 ${resolve(scratch, 'issues/01.md')} 與 ${reportPath2}；只驗 ${reviewsPath} 已列退件項＋一項本輪新破壞檢查；不重跑完整套件，測試結果引用交件方報告並註明是引用；審查報告寫入 ${reviewsPath}；最後回覆只准兩行：通過或退件一行＋報告檔路徑一行。`;
  if (reviewSpec !== expectedReviewSpec) throw new Error('review spec 不逐字相等（round≥2 前綴）');
  const expectedReviewArgs = ['exec', '-m', 'gpt-5.6-sol', '-s', 'read-only', '-C', worktreePath1, '--skip-git-repo-check', '-c', 'model_reasoning_effort="high"', '-o', join(scratch, 'reports', '01-r2-review-last.txt'), reviewSpec];
  if (JSON.stringify(reviewCalls[0]) !== JSON.stringify(expectedReviewArgs)) throw new Error('review 旗標序不逐字相符（不應有 --add-dir）');
  const savedAfterReview = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
  if (savedAfterReview.review_round !== 1) throw new Error('review_round 未落盤');
  if (savedAfterReview.status !== 'dispatched') throw new Error('review 不應改動 status');

  writePipeline({ ticket: { status: 'pending', round: 1 } });
  const scoutCalls = [];
  const scoutResult = await dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'scout', spawnFn: (args) => { scoutCalls.push(args); const child = new EventEmitter(); child.kill = () => child.emit('exit', null, 'SIGKILL'); setTimeout(() => child.emit('exit', 0), 0); return child; } });
  if (!scoutResult.ok) throw new Error('scout 派工失敗');
  const scoutSpec = scoutCalls[0][scoutCalls[0].length - 1];
  const prescanPath = join(scratch, 'reports', '01-prescan.md');
  const expectedScoutSpec = `${COMMON_PREFIX}讀 ${resolve(scratch, 'issues/01.md')}；唯讀預掃受影響檔，摘要一頁寫入 ${prescanPath}；最後回覆只准兩行。`;
  if (scoutSpec !== expectedScoutSpec) throw new Error('scout spec 不逐字相等');
  const expectedScoutArgs = ['exec', '-m', 'gpt-5.6-luna', '-s', 'read-only', '-C', worktreePath1, '--skip-git-repo-check', '-c', 'model_reasoning_effort="low"', '-o', join(scratch, 'reports', '01-r1-scout-last.txt'), scoutSpec];
  if (JSON.stringify(scoutCalls[0]) !== JSON.stringify(expectedScoutArgs)) throw new Error('scout 旗標序不逐字相符');
  const savedAfterScout = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
  if (savedAfterScout.scout_round !== 1) throw new Error('scout_round 未落盤');

  // ---- 驗收 7：worktree 附掛既有分支（不帶 -b）----
  git(['branch', 'feature-attach'], root);
  writeFileSync(join(scratch, 'issues', '02.md'), '# attach\n');
  writeFileSync(pipelinePath, JSON.stringify({ mode: 'dual', approved: true, tickets: [{ id: '02', file: 'issues/02.md', status: 'pending', branch: 'feature-attach', round: 1 }] }));
  const attachResult = await dispatch({ cwd: root, effort: 'x', ticketId: '02', spawnFn: (args) => { const child = new EventEmitter(); child.kill = () => child.emit('exit', null, 'SIGKILL'); setTimeout(() => child.emit('exit', 0), 0); return child; } });
  if (!attachResult.ok) throw new Error('附掛既有分支應成功（若誤用 -b，git 對已存在分支會報錯而失敗）');
  if (!existsSync(join(root, '.worktrees', 'feature-attach'))) throw new Error('附掛路徑未建立 worktree');

  // ---- 驗收 7：worktree 基準落後 → fail ----
  git(['worktree', 'add', '-b', 'feature-behind', join(root, '.worktrees', 'feature-behind')], root);
  writeFileSync(join(root, 'README.md'), 'root advanced\n');
  git(['add', 'README.md'], root);
  git(['commit', '-m', 'advance base'], root);
  writeFileSync(join(scratch, 'issues', '03.md'), '# behind\n');
  writeFileSync(pipelinePath, JSON.stringify({ mode: 'dual', approved: true, tickets: [{ id: '03', file: 'issues/03.md', status: 'pending', branch: 'feature-behind', round: 1 }] }));
  const behindBefore = readFileSync(pipelinePath, 'utf8');
  const behindResult = await dispatch({ cwd: root, effort: 'x', ticketId: '03', spawnFn: failingSpawn });
  if (behindResult.ok) throw new Error('worktree 基準落後應 fail');
  if (readFileSync(pipelinePath, 'utf8') !== behindBefore) throw new Error('worktree 基準落後失敗案不應寫盤');

  // ---- 驗收 4：鎖目錄已存在時 start 重試後 fail，pipeline.json 不變 ----
  writeFileSync(join(scratch, 'issues', '04.md'), '# locked\n');
  writeFileSync(pipelinePath, JSON.stringify({ mode: 'dual', approved: true, tickets: [{ id: '04', file: 'issues/04.md', status: 'pending', branch: 'feature-lock', round: 1 }] }));
  const beforeLockContent = readFileSync(pipelinePath, 'utf8');
  mkdirSync(join(scratch, 'pipeline.lock'));
  const lockResult = await dispatch({ cwd: root, effort: 'x', ticketId: '04', spawnFn: failingSpawn });
  if (lockResult.ok) throw new Error('鎖目錄長期存在應 fail');
  if (readFileSync(pipelinePath, 'utf8') !== beforeLockContent) throw new Error('鎖競爭失敗案不應寫盤');
  rmdirSync(join(scratch, 'pipeline.lock'));
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  const result = await dispatch(parseArgs(process.argv.slice(2)));
  if (!result.ok) { process.stderr.write(`${result.message}\n`); process.exit(result.code); }
  const output = { ticket: result.ticket, role: result.role, round: result.round, code: result.code, report: result.report, last_message: result.last_message };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (result.code !== 0 || result.timed_out) process.exit(1);
}
