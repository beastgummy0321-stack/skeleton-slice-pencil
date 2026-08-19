import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const fail = (message, code = 2) => ({ ok: false, code, message });
const normalize = (value) => String(value).replace(/\\/g, '/').toLowerCase();
const lineCount = (path) => {
  const content = readFileSync(path, 'utf8').replace(/(?:\r?\n)+$/, '');
  return content ? content.split(/\r?\n/).length : 0;
};

const ROLE_CONFIG = {
  review: { model: 'gpt-5.6-sol', taskField: 'review_task_id', dispatchField: 'review_dispatch_id', statusGate: 'dispatched' },
  scout: { model: 'gpt-5.6-luna', taskField: 'scout_task_id', dispatchField: 'scout_dispatch_id', statusGate: 'pending' },
};

function commandParts(command) {
  return String(command).match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? ['orca'];
}

function invokeOrca(args) {
  const [command, ...prefix] = commandParts(process.env.ORCA_CLI_COMMAND || 'orca');
  const result = spawnSync(command, [...prefix, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'orca command failed').trim().split(/\r?\n/)[0]);
  const text = (result.stdout || '').trim();
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error('orca command did not return JSON'); }
}

function field(value, names) {
  if (!value || typeof value !== 'object') return null;
  for (const name of names) if (typeof value[name] === 'string') return value[name];
  for (const child of Object.values(value)) {
    const found = field(child, names);
    if (found) return found;
  }
  return null;
}

function hasPastedContent(value) {
  return JSON.stringify(value).includes('Pasted Content');
}

function verifyPromptSent(invoke, terminalHandle) {
  if (!terminalHandle) throw new Error('worker-start 回應缺 terminal handle，無法驗證 prompt 已送出');
  const deadline = Date.now() + 60_000;
  const read = () => {
    if (Date.now() > deadline) throw new Error('prompt 送出驗證超過 60 秒');
    return invoke(['terminal', 'read', '--terminal', terminalHandle, '--json']);
  };
  if (!hasPastedContent(read())) return;
  invoke(['terminal', 'send', '--terminal', terminalHandle, '--enter', '--json']);
  if (hasPastedContent(read())) throw new Error('prompt 仍滯留輸入框');
}

function effortPath(cwd, effort) {
  if (effort) return join(cwd, '.scratch', effort);
  const scratch = join(cwd, '.scratch');
  const choices = existsSync(scratch) ? readdirSync(scratch).filter((name) => existsSync(join(scratch, name, 'pipeline.json'))) : [];
  if (choices.length === 1) return join(scratch, choices[0]);
  throw new Error('--effort is required when .scratch has no unique pipeline');
}

// best-effort release：成功回傳 null，失敗回傳警告字串（絕不拋錯，呼叫端流程不中斷）
function releaseIfPresent(invoke, dispatchId) {
  if (!dispatchId) return null;
  try {
    invoke(['orchestration', 'worker-release', '--dispatch', dispatchId, '--json']);
    return null;
  } catch (error) {
    return `release 舊 dispatch ${dispatchId} 失敗（已忽略，請視需要手動 release）：${error.message}`;
  }
}

// task-create → worker-start → verifyPromptSent → dispatch-show 一條龍；worker-start 成功後任何一步失敗都 best-effort release 再拋錯
function runDispatch({ invoke, spec, model, worktreeArg }) {
  const created = invoke(['orchestration', 'task-create', '--spec', spec, '--json']);
  const taskId = created.task_id ?? created.taskId ?? created.task?.id ?? created.id;
  if (!taskId) throw new Error('task-create 回應缺 task_id');
  let dispatchId = null;
  try {
    const started = invoke(['orchestration', 'worker-start', '--task', taskId, '--worktree', worktreeArg, '--agent', 'codex', '--model', model, '--effort', 'high', '--json']);
    verifyPromptSent(invoke, field(started, ['terminal_handle', 'terminalHandle', 'agentTerminalHandle', 'handle']));
    const shown = invoke(['orchestration', 'dispatch-show', '--task', taskId, '--json']);
    dispatchId = field(shown, ['dispatch_id', 'dispatchId']);
    if (!dispatchId) throw new Error('dispatch-show 回應缺 dispatch_id');
  } catch (innerError) {
    if (dispatchId) {
      try { invoke(['orchestration', 'worker-release', '--dispatch', dispatchId, '--json']); } catch { /* best-effort */ }
      throw innerError;
    }
    throw new Error(`${innerError.message}（task_id ${taskId}，請手動 release）`);
  }
  return { taskId, dispatchId, runId: field(created, ['run_id', 'runId']) || null };
}

export function dispatch({ cwd, effort, ticketId, redispatch = false, role = 'impl', invoke = invokeOrca, worktreeSupported = true }) {
  if (!['impl', 'review', 'scout'].includes(role)) return fail('--role 必須是 impl｜review｜scout');
  const scratch = effortPath(cwd, effort);
  const pipelinePath = join(scratch, 'pipeline.json');
  let pipeline;
  try { pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')); } catch { return fail('找不到或無法讀取 pipeline.json'); }
  const tickets = pipeline.tickets ?? [];
  const ticket = tickets.find((item) => String(item.id) === String(ticketId));
  if (pipeline.approved !== true) return fail('凍結閘：pipeline.json approved!=true');
  if (!ticket) return fail(`派工閘：pipeline.json 查無票 ${ticketId}`);
  const ticketPath = resolve(scratch, ticket.file);
  try {
    if (lineCount(ticketPath) > 150) return fail('票太大，回 /to-tickets 重切');
  } catch { return fail(`派工閘：票檔不存在 ${ticket.file}`); }

  if (role === 'impl') {
    const accepted = ticket.status === 'pending' || (ticket.status === 'rejected' && redispatch);
    if (!accepted) return fail(`派工閘：票 ${ticket.id} 狀態為 ${ticket.status}`);
    if (ticket.status === 'pending' && ticket.dispatch_id) return fail(`派工閘：票 ${ticket.id} 已有 dispatch_id`);
    const blocked = (ticket.blocked_by ?? []).filter((id) => tickets.find((item) => item.id === id)?.status !== 'merged');
    if (blocked.length) return fail(`派工閘：票 ${ticket.id} 的擋票未全部合併：${blocked.join('、')}`);
    const shared = new Set((ticket.shared_files ?? []).map(normalize));
    for (const other of tickets) {
      if (other === ticket || !['dispatched', 'approved', 'merging'].includes(other.status)) continue;
      const overlap = (other.shared_files ?? []).map(normalize).filter((path) => shared.has(path));
      if (overlap.length) return fail(`派工閘：票 ${ticket.id} 與在飛票 ${other.id} 共用檔重疊：${overlap.join('、')}`);
      if (ticket.migration && other.migration) return fail(`派工閘：帶 migration 的票同時只准一張在飛（票 ${other.id}）`);
    }
  } else {
    const cfg = ROLE_CONFIG[role];
    if (ticket.status !== cfg.statusGate) return fail(`派工閘：${role} 需要票 ${ticket.id} 狀態為 ${cfg.statusGate}，現為 ${ticket.status}`);
  }

  let worktreeArg;
  if (role === 'impl') {
    if (worktreeSupported) {
      if (!ticket.branch) return fail(`派工閘：票 ${ticket.id} 缺 branch 欄，無法具名 worktree 隔離`);
      worktreeArg = `branch:${ticket.branch}`;
    } else {
      const inFlight = tickets.some((item) => item !== ticket && ['dispatched', 'approved', 'merging'].includes(item.status));
      if (inFlight) return fail('worktree 隔離不可用，一次只准一張 impl 票在飛');
      worktreeArg = 'current';
    }
  } else {
    worktreeArg = 'current';
  }

  const round = role === 'impl'
    ? (ticket.status === 'rejected' ? Number(ticket.round || 1) + 1 : Number(ticket.round || 1))
    : Number(ticket.round || 1);

  let spec;
  let model;
  if (role === 'impl') {
    model = 'gpt-5.6-terra';
    const reportPath = join(scratch, 'reports', `${ticket.id}-r${round}.md`);
    const review = round > 1 ? `；第 2 輪起先讀 ${join(scratch, 'reviews', `${ticket.id}.md`)}。` : '；';
    spec = `讀 ${ticketPath} 後開工${review}完整報告寫入 ${reportPath}；交件前逐條自核票面驗收清單，報告附對照表；worker_done 本文只准兩行：結論一行＋報告檔路徑。`;
  } else if (role === 'review') {
    model = ROLE_CONFIG.review.model;
    const reportPath = join(scratch, 'reports', `${ticket.id}-r${round}.md`);
    const reviewPath = join(scratch, 'reviews', `${ticket.id}.md`);
    spec = `讀 ${ticketPath} 與 ${reportPath} 後審查；審查不得改碼；審查報告寫入 ${reviewPath}；worker_done 本文只准兩行：通過或退件一行＋報告檔路徑一行。`;
    if (round >= 2) spec = `只驗 ${reviewPath} 已列退件項＋一項本輪新破壞檢查；${spec}`;
  } else {
    model = ROLE_CONFIG.scout.model;
    const prescanPath = join(scratch, 'reports', `${ticket.id}-prescan.md`);
    spec = `讀 ${ticketPath}；唯讀預掃受影響檔，摘要一頁寫入 ${prescanPath}；不得改碼；worker_done 本文只准兩行：結論一行＋報告檔路徑一行。`;
  }

  let warning;
  try {
    if (role === 'impl') {
      if (ticket.status === 'rejected') {
        const w = releaseIfPresent(invoke, ticket.dispatch_id);
        if (w) warning = w;
      }
    } else {
      const cfg = ROLE_CONFIG[role];
      if (ticket[cfg.dispatchField]) {
        const w = releaseIfPresent(invoke, ticket[cfg.dispatchField]);
        if (w) warning = w;
      }
    }

    const { taskId, dispatchId, runId } = runDispatch({ invoke, spec, model, worktreeArg });

    if (role === 'impl') {
      ticket.task_id = taskId;
      ticket.dispatch_id = dispatchId;
      ticket.round = round;
      ticket.status = 'dispatched';
    } else {
      const cfg = ROLE_CONFIG[role];
      ticket[cfg.taskField] = taskId;
      ticket[cfg.dispatchField] = dispatchId;
    }
    if (pipeline.run_id == null) pipeline.run_id = runId;
    if (pipeline.pending_ack === undefined) pipeline.pending_ack = null;
    writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);

    const result = { ok: true, ticket: String(ticket.id), role, task_id: taskId, dispatch_id: dispatchId, round, status: ticket.status };
    if (warning) result.warning = warning;
    return result;
  } catch (error) { return fail(error.message, 1); }
}

function parseArgs(args) {
  const options = { cwd: process.cwd(), redispatch: false, role: 'impl' };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--ticket') options.ticketId = args[++index];
    if (args[index] === '--cwd') options.cwd = args[++index];
    if (args[index] === '--effort') options.effort = args[++index];
    if (args[index] === '--redispatch') options.redispatch = true;
    if (args[index] === '--role') options.role = args[++index];
  }
  return options;
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'dispatch-test-'));
  try {
    const scratch = join(root, '.scratch', 'x');
    const issue = join(scratch, 'issues', '01.md');
    spawnSync(process.execPath, ['-e', "require('fs').mkdirSync(process.argv[1],{recursive:true})", join(scratch, 'issues')]);
    const pipelinePath = join(scratch, 'pipeline.json');
    const baseTicket = () => ({ id: '01', file: 'issues/01.md', status: 'pending', branch: 'feature/01', blocked_by: [], shared_files: [], migration: null, dispatch_id: null, task_id: null, round: 1 });
    const writePipeline = (changes = {}) => {
      const ticket = { ...baseTicket(), ...(changes.ticket ?? {}) };
      const pipeline = { mode: 'dual', approved: true, run_id: null, pending_ack: null, tickets: [ticket], ...(changes.pipeline ?? {}) };
      writeFileSync(pipelinePath, JSON.stringify(pipeline));
      return pipeline;
    };
    const expectRejected = (name, changes, extra = {}) => {
      writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
      writePipeline(changes);
      const outcome = dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: () => { throw new Error('拒派案不得呼叫 orca'); }, ...extra });
      // code 必須是閘門拒派(2)，不是 invoke 拋錯落到的執行期失敗(1)——後者代表閘門其實被繞過了。
      if (outcome.ok || outcome.code !== 2) throw new Error(`${name} 未拒派`);
    };
    // 證紅方式：把 approved 改為 false，此案必須由綠轉紅。
    expectRejected('未點頭', { pipeline: { approved: false } });
    expectRejected('非 pending', { ticket: { status: 'approved' } });
    expectRejected('擋票未合', { ticket: { blocked_by: ['02'] }, pipeline: { tickets: [{ ...baseTicket(), blocked_by: ['02'] }, { id: '02', status: 'pending' }] } });
    expectRejected('共用檔重疊', { ticket: { shared_files: ['src/a.ts'] }, pipeline: { tickets: [{ ...baseTicket(), shared_files: ['src/a.ts'] }, { id: '02', status: 'dispatched', shared_files: ['src/a.ts'] }] } });
    expectRejected('migration 雙飛', { ticket: { migration: 'm1' }, pipeline: { tickets: [{ ...baseTicket(), migration: 'm1' }, { id: '02', status: 'dispatched', migration: 'm1', shared_files: [] }] } });
    writeFileSync(issue, `${Array.from({ length: 151 }, () => '# ticket').join('\n')}\n`);
    writePipeline();
    if (dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: () => { throw new Error('151 行不得派工'); } }).ok) throw new Error('151 行票未拒派');
    expectRejected('已有 dispatch_id', { ticket: { dispatch_id: 'd_old' } });
    // A2 證紅方式：worktreeSupported=true 卻缺 branch 欄，必須拒派。
    expectRejected('缺 branch 欄', { ticket: { branch: undefined } });

    writeFileSync(issue, `SECRET ticket body\n`);
    writePipeline();
    const calls = [];
    let pastedReads = 0;
    const stub = (args) => {
      calls.push(args);
      if (args.includes('task-create')) return { task_id: 't_1', run_id: 'r_1' };
      if (args.includes('worker-start')) return { agentTerminalHandle: 'term_1' };
      if (args.includes('terminal') && args.includes('read')) return { output: pastedReads++ === 0 ? 'Pasted Content' : 'prompt delivered' };
      if (args.includes('terminal') && args.includes('send')) return {};
      if (args.includes('dispatch-show')) return { dispatch_id: 'd_1' };
      return {};
    };
    const result = dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: stub });
    if (!result.ok || result.task_id !== 't_1') throw new Error('成功派工案失敗');
    const spec = calls.find((call) => call.includes('task-create'))?.[callIndex(calls.find((call) => call.includes('task-create')), '--spec') + 1];
    const expectedSpec = `讀 ${issue} 後開工；完整報告寫入 ${join(scratch, 'reports', '01-r1.md')}；交件前逐條自核票面驗收清單，報告附對照表；worker_done 本文只准兩行：結論一行＋報告檔路徑。`;
    if (spec !== expectedSpec || spec.includes('SECRET')) throw new Error('task-create spec 不符合固定模板');
    const workerStart = calls.find((call) => call.includes('worker-start'));
    if (JSON.stringify(workerStart) !== JSON.stringify(['orchestration', 'worker-start', '--task', 't_1', '--worktree', 'branch:feature/01', '--agent', 'codex', '--model', 'gpt-5.6-terra', '--effort', 'high', '--json'])) throw new Error('worker-start 旗標不正確（應具名 worktree）');
    // 專門的 selector 前綴斷言：獨立於上面的整條旗標比對，只在 --worktree 值缺 `branch:` 前綴時才會紅
    // （例如把裸分支名 'feature/01' 當值送出——orca worker-start 只認帶前綴的 selector）。
    const workerStartWorktreeValue = workerStart[workerStart.indexOf('--worktree') + 1];
    if (!workerStartWorktreeValue.startsWith('branch:')) throw new Error('impl worktree 旗標缺 selector 前綴（應為 branch:<branch>，不得是裸分支名）');
    const promptCalls = calls.filter((call) => call[0] === 'terminal');
    if (JSON.stringify(promptCalls) !== JSON.stringify([['terminal', 'read', '--terminal', 'term_1', '--json'], ['terminal', 'send', '--terminal', 'term_1', '--enter', '--json'], ['terminal', 'read', '--terminal', 'term_1', '--json']])) throw new Error('滯留 prompt 未補 Enter 後複驗');
    const saved = JSON.parse(readFileSync(pipelinePath, 'utf8'));
    const savedTicket = saved.tickets[0];
    if (saved.run_id !== 'r_1' || !Object.hasOwn(saved, 'pending_ack') || saved.pending_ack !== null || savedTicket.task_id !== 't_1' || savedTicket.dispatch_id !== 'd_1' || savedTicket.round !== 1 || savedTicket.status !== 'dispatched') throw new Error('pipeline 全欄位未落盤');

    // A2 保守路徑：worktreeSupported=false 且有其他 impl 票在飛 → 拒派（自測以參數注入模擬「不支援」）。
    writePipeline({ pipeline: { tickets: [baseTicket(), { id: '02', status: 'dispatched' }] } });
    const conservativeRejected = dispatch({ cwd: root, effort: 'x', ticketId: '01', worktreeSupported: false, invoke: () => { throw new Error('保守拒派案不得呼叫 orca'); } });
    if (conservativeRejected.ok || !conservativeRejected.message.includes('worktree 隔離不可用，一次只准一張 impl 票在飛')) throw new Error('worktree 不支援時的保守拒派未生效');
    // 證紅方式：拿掉在飛票（只剩票 01）後，同樣 worktreeSupported=false 必須改為沿用 current 成功。
    writePipeline();
    const conservativeOkCalls = [];
    const conservativeOk = dispatch({ cwd: root, effort: 'x', ticketId: '01', worktreeSupported: false, invoke: (args) => {
      conservativeOkCalls.push(args);
      if (args.includes('task-create')) return { task_id: 't_c' };
      if (args.includes('worker-start')) return { terminalHandle: 'term_c' };
      if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' };
      if (args.includes('dispatch-show')) return { dispatch_id: 'd_c' };
      return {};
    } });
    if (!conservativeOk.ok) throw new Error('無在飛票時 worktreeSupported=false 應沿用 current 成功');
    const conservativeStart = conservativeOkCalls.find((call) => call.includes('worker-start'));
    if (conservativeStart[conservativeStart.indexOf('--worktree') + 1] !== 'current') throw new Error('無在飛票時應沿用 current worktree');

    writePipeline();
    const beforeFailure = readFileSync(pipelinePath, 'utf8');
    const showFail = dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: (args) => {
      if (args.includes('task-create')) return { task_id: 't_show_fail' };
      if (args.includes('worker-start')) return { terminalHandle: 'term_show_fail' };
      if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' };
      if (args.includes('dispatch-show')) return {};
      return {};
    } });
    if (showFail.ok) throw new Error('dispatch-show 空回應未失敗');
    if (!showFail.message.includes('t_show_fail') || !showFail.message.includes('請手動 release')) throw new Error('A3：dispatch-show 失敗後錯誤訊息未含 task_id 與請手動 release');
    if (readFileSync(pipelinePath, 'utf8') !== beforeFailure) throw new Error('orca 失敗仍修改 pipeline.json');

    writePipeline({ ticket: { status: 'rejected', dispatch_id: 'd_old' } });
    const redispatchCalls = [];
    const redispatchStub = (args) => { redispatchCalls.push(args); if (args.includes('worker-release')) throw new Error('release 服務暫時不可用'); if (args.includes('task-create')) return { task_id: 't_2' }; if (args.includes('worker-start')) return { terminalHandle: 'term_2' }; if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' }; if (args.includes('dispatch-show')) return { dispatch_id: 'd_2' }; return {}; };
    const redispatch = dispatch({ cwd: root, effort: 'x', ticketId: '01', redispatch: true, invoke: redispatchStub });
    // 證紅方式：worker-release 故意拋錯，若 A3 容錯失效，dispatch 會整個失敗（ok=false）。
    if (!redispatch.ok || redispatch.round !== 2 || !redispatch.warning?.includes('d_old')) throw new Error('redispatch 的 release 拋錯未被容錯為 warning，或 round 未加一');
    // 順序斷言：release 舊 worker 必須發生在 task-create／worker-start 之前——否則等於先開新工人再放舊工人，正是孤兒情境。
    if (JSON.stringify(redispatchCalls[0]) !== JSON.stringify(['orchestration', 'worker-release', '--dispatch', 'd_old', '--json'])) throw new Error('impl 重派前未先嘗試 release 舊 dispatch_id（順序不符）');
    const roundTwoSpec = redispatchCalls.find((call) => call.includes('task-create'));
    if (!roundTwoSpec[roundTwoSpec.indexOf('--spec') + 1].includes(`；第 2 輪起先讀 ${join(scratch, 'reviews', '01.md')}。完整報告`)) throw new Error('第 2 輪 spec 分隔符不符合契約');
    if (redispatchCalls.some((call) => call[0] === 'terminal' && call.includes('send'))) throw new Error('未滯留 prompt 不得補送 Enter');

    // ---- A1：--role review / scout ----
    writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
    const roleStub = (idSuffix) => {
      const calls = [];
      const fn = (args) => {
        calls.push(args);
        if (args.includes('task-create')) return { task_id: `t_${idSuffix}` };
        if (args.includes('worker-start')) return { terminalHandle: `term_${idSuffix}` };
        if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' };
        if (args.includes('dispatch-show')) return { dispatch_id: `d_${idSuffix}` };
        return {};
      };
      fn.calls = calls;
      return fn;
    };

    // review：狀態非 dispatched 拒派
    expectRejected('review 需 dispatched', { ticket: { status: 'pending' } }, { role: 'review' });
    // review：狀態 dispatched 准，spec 逐字相等，模型 sol
    writePipeline({ ticket: { status: 'dispatched', round: 1 } });
    const reviewStub = roleStub('rv');
    const reviewResult = dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'review', invoke: reviewStub });
    if (!reviewResult.ok) throw new Error('review 派工失敗');
    const reviewSpecCall = reviewStub.calls.find((call) => call.includes('task-create'));
    const reviewSpec = reviewSpecCall[reviewSpecCall.indexOf('--spec') + 1];
    const expectedReviewSpec = `讀 ${issue} 與 ${join(scratch, 'reports', '01-r1.md')} 後審查；審查不得改碼；審查報告寫入 ${join(scratch, 'reviews', '01.md')}；worker_done 本文只准兩行：通過或退件一行＋報告檔路徑一行。`;
    if (reviewSpec !== expectedReviewSpec) throw new Error('review spec 不逐字相等於固定模板');
    const reviewStart = reviewStub.calls.find((call) => call.includes('worker-start'));
    if (reviewStart[reviewStart.indexOf('--model') + 1] !== 'gpt-5.6-sol') throw new Error('review 模型旗標不正確');
    if (reviewStart[reviewStart.indexOf('--worktree') + 1] !== 'current') throw new Error('review 應一律 --worktree current');
    const savedAfterReview = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
    if (savedAfterReview.review_task_id !== 't_rv' || savedAfterReview.review_dispatch_id !== 'd_rv') throw new Error('review 落盤欄位不正確');
    // A1：verifyPromptSent 對 review 也一律執行——必須有 terminal read 呼叫序列，不是被 role 分支跳過。
    const reviewPromptCalls = reviewStub.calls.filter((call) => call[0] === 'terminal');
    if (JSON.stringify(reviewPromptCalls) !== JSON.stringify([['terminal', 'read', '--terminal', 'term_rv', '--json']])) throw new Error('review 派工未執行 verifyPromptSent（terminal read 缺失）');

    // review round>=2 前綴
    writePipeline({ ticket: { status: 'dispatched', round: 2 } });
    const review2Stub = roleStub('rv2');
    const review2Result = dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'review', invoke: review2Stub });
    if (!review2Result.ok) throw new Error('round2 review 派工失敗');
    const review2SpecCall = review2Stub.calls.find((call) => call.includes('task-create'));
    const review2Spec = review2SpecCall[review2SpecCall.indexOf('--spec') + 1];
    if (!review2Spec.startsWith(`只驗 ${join(scratch, 'reviews', '01.md')} 已列退件項＋一項本輪新破壞檢查；讀`)) throw new Error('round>=2 review spec 缺前綴');

    // review 跳過 blocked_by／shared_files／migration 三閘
    writePipeline({ ticket: { status: 'dispatched', blocked_by: ['02'], shared_files: ['src/a.ts'], migration: 'm1' }, pipeline: { tickets: [{ ...baseTicket(), status: 'dispatched', blocked_by: ['02'], shared_files: ['src/a.ts'], migration: 'm1' }, { id: '02', status: 'dispatched', shared_files: ['src/a.ts'], migration: 'm1' }] } });
    const reviewGateStub = roleStub('rvgate');
    if (!dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'review', invoke: reviewGateStub }).ok) throw new Error('review 不應受三閘阻擋');

    // scout：狀態非 pending 拒派
    expectRejected('scout 需 pending', { ticket: { status: 'dispatched' } }, { role: 'scout' });
    // scout：狀態 pending 准，模型 luna，spec 逐字相等
    writePipeline({ ticket: { status: 'pending' } });
    const scoutStub = roleStub('sc');
    const scoutResult = dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'scout', invoke: scoutStub });
    if (!scoutResult.ok) throw new Error('scout 派工失敗');
    const scoutSpecCall = scoutStub.calls.find((call) => call.includes('task-create'));
    const scoutSpec = scoutSpecCall[scoutSpecCall.indexOf('--spec') + 1];
    const expectedScoutSpec = `讀 ${issue}；唯讀預掃受影響檔，摘要一頁寫入 ${join(scratch, 'reports', '01-prescan.md')}；不得改碼；worker_done 本文只准兩行：結論一行＋報告檔路徑一行。`;
    if (scoutSpec !== expectedScoutSpec) throw new Error('scout spec 不逐字相等於固定模板');
    const scoutStart = scoutStub.calls.find((call) => call.includes('worker-start'));
    if (scoutStart[scoutStart.indexOf('--model') + 1] !== 'gpt-5.6-luna') throw new Error('scout 模型旗標不正確');
    const savedAfterScout = JSON.parse(readFileSync(pipelinePath, 'utf8')).tickets[0];
    if (savedAfterScout.scout_task_id !== 't_sc' || savedAfterScout.scout_dispatch_id !== 'd_sc') throw new Error('scout 落盤欄位不正確');
    // A1：verifyPromptSent 對 scout 也一律執行——必須有 terminal read 呼叫序列，不是被 role 分支跳過。
    const scoutPromptCalls = scoutStub.calls.filter((call) => call[0] === 'terminal');
    if (JSON.stringify(scoutPromptCalls) !== JSON.stringify([['terminal', 'read', '--terminal', 'term_sc', '--json']])) throw new Error('scout 派工未執行 verifyPromptSent（terminal read 缺失）');

    // 同 role 已有舊 dispatch_id 時重派前先 release（容錯：拋錯仍非致命）
    writePipeline({ ticket: { status: 'dispatched', review_dispatch_id: 'd_old_review' } });
    const reviewRedispatchCalls = [];
    const reviewRedispatchStub = (args) => { reviewRedispatchCalls.push(args); if (args.includes('worker-release')) throw new Error('release 掛了'); if (args.includes('task-create')) return { task_id: 't_rv3' }; if (args.includes('worker-start')) return { terminalHandle: 'term_rv3' }; if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' }; if (args.includes('dispatch-show')) return { dispatch_id: 'd_rv3' }; return {}; };
    const reviewRedispatch = dispatch({ cwd: root, effort: 'x', ticketId: '01', role: 'review', invoke: reviewRedispatchStub });
    if (!reviewRedispatch.ok || !reviewRedispatch.warning?.includes('d_old_review')) throw new Error('review 重派時舊 dispatch_id release 拋錯未被容錯');
    if (JSON.stringify(reviewRedispatchCalls[0]) !== JSON.stringify(['orchestration', 'worker-release', '--dispatch', 'd_old_review', '--json'])) throw new Error('review 重派前未先嘗試 release 舊 dispatch_id');

    process.stdout.write('dispatch self-test passed\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function callIndex(call, value) { return call.indexOf(value); }

if (process.argv.includes('--self-test')) selfTest();
else {
  const result = dispatch(parseArgs(process.argv.slice(2)));
  if (!result.ok) { process.stderr.write(`${result.message}\n`); process.exit(result.code); }
  const output = { ticket: result.ticket, task_id: result.task_id, dispatch_id: result.dispatch_id, round: result.round, status: result.status };
  if (result.warning) output.warning = result.warning;
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
