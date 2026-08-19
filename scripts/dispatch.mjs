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

export function dispatch({ cwd, effort, ticketId, redispatch = false, invoke = invokeOrca }) {
  const scratch = effortPath(cwd, effort);
  const pipelinePath = join(scratch, 'pipeline.json');
  let pipeline;
  try { pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')); } catch { return fail('找不到或無法讀取 pipeline.json'); }
  const ticket = (pipeline.tickets ?? []).find((item) => String(item.id) === String(ticketId));
  if (pipeline.approved !== true) return fail('凍結閘：pipeline.json approved!=true');
  if (!ticket) return fail(`派工閘：pipeline.json 查無票 ${ticketId}`);
  const ticketPath = resolve(scratch, ticket.file);
  try {
    if (lineCount(ticketPath) > 150) return fail('票太大，回 /to-tickets 重切');
  } catch { return fail(`派工閘：票檔不存在 ${ticket.file}`); }
  const accepted = ticket.status === 'pending' || (ticket.status === 'rejected' && redispatch);
  if (!accepted) return fail(`派工閘：票 ${ticket.id} 狀態為 ${ticket.status}`);
  if (ticket.status === 'pending' && ticket.dispatch_id) return fail(`派工閘：票 ${ticket.id} 已有 dispatch_id`);
  const tickets = pipeline.tickets ?? [];
  const blocked = (ticket.blocked_by ?? []).filter((id) => tickets.find((item) => item.id === id)?.status !== 'merged');
  if (blocked.length) return fail(`派工閘：票 ${ticket.id} 的擋票未全部合併：${blocked.join('、')}`);
  const shared = new Set((ticket.shared_files ?? []).map(normalize));
  for (const other of tickets) {
    if (other === ticket || !['dispatched', 'approved', 'merging'].includes(other.status)) continue;
    const overlap = (other.shared_files ?? []).map(normalize).filter((path) => shared.has(path));
    if (overlap.length) return fail(`派工閘：票 ${ticket.id} 與在飛票 ${other.id} 共用檔重疊：${overlap.join('、')}`);
    if (ticket.migration && other.migration) return fail(`派工閘：帶 migration 的票同時只准一張在飛（票 ${other.id}）`);
  }
  const round = ticket.status === 'rejected' ? Number(ticket.round || 1) + 1 : Number(ticket.round || 1);
  const reportPath = join(scratch, 'reports', `${ticket.id}-r${round}.md`);
  const review = round > 1 ? `；第 2 輪起先讀 ${join(scratch, 'reviews', `${ticket.id}.md`)}。` : '；';
  const spec = `讀 ${ticketPath} 後開工${review}完整報告寫入 ${reportPath}；交件前逐條自核票面驗收清單，報告附對照表；worker_done 本文只准兩行：結論一行＋報告檔路徑。`;
  try {
    if (ticket.status === 'rejected') invoke(['orchestration', 'worker-release', '--dispatch', ticket.dispatch_id, '--json']);
    const created = invoke(['orchestration', 'task-create', '--spec', spec, '--json']);
    const taskId = created.task_id ?? created.taskId ?? created.task?.id ?? created.id;
    if (!taskId) throw new Error('task-create 回應缺 task_id');
    const started = invoke(['orchestration', 'worker-start', '--task', taskId, '--worktree', 'current', '--agent', 'codex', '--model', 'gpt-5.6-terra', '--effort', 'high', '--json']);
    verifyPromptSent(invoke, field(started, ['terminal_handle', 'terminalHandle', 'agentTerminalHandle', 'handle']));
    const shown = invoke(['orchestration', 'dispatch-show', '--task', taskId, '--json']);
    const dispatchId = field(shown, ['dispatch_id', 'dispatchId']);
    if (!dispatchId) throw new Error('dispatch-show 回應缺 dispatch_id');
    ticket.task_id = taskId;
    ticket.dispatch_id = dispatchId;
    ticket.round = round;
    ticket.status = 'dispatched';
    if (pipeline.run_id == null) pipeline.run_id = field(created, ['run_id', 'runId']) || null;
    if (pipeline.pending_ack === undefined) pipeline.pending_ack = null;
    writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);
    return { ok: true, ticket: String(ticket.id), task_id: taskId, dispatch_id: dispatchId, round, status: 'dispatched' };
  } catch (error) { return fail(error.message, 1); }
}

function parseArgs(args) {
  const options = { cwd: process.cwd(), redispatch: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--ticket') options.ticketId = args[++index];
    if (args[index] === '--cwd') options.cwd = args[++index];
    if (args[index] === '--effort') options.effort = args[++index];
    if (args[index] === '--redispatch') options.redispatch = true;
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
    const baseTicket = () => ({ id: '01', file: 'issues/01.md', status: 'pending', blocked_by: [], shared_files: [], migration: null, dispatch_id: null, task_id: null, round: 1 });
    const writePipeline = (changes = {}) => {
      const ticket = { ...baseTicket(), ...(changes.ticket ?? {}) };
      const pipeline = { mode: 'dual', approved: true, run_id: null, pending_ack: null, tickets: [ticket], ...(changes.pipeline ?? {}) };
      writeFileSync(pipelinePath, JSON.stringify(pipeline));
      return pipeline;
    };
    const expectRejected = (name, changes) => {
      writeFileSync(issue, `${Array.from({ length: 150 }, () => '# ticket').join('\n')}\n`);
      writePipeline(changes);
      if (dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: () => { throw new Error('拒派案不得呼叫 orca'); } }).ok) throw new Error(`${name} 未拒派`);
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
    if (JSON.stringify(workerStart) !== JSON.stringify(['orchestration', 'worker-start', '--task', 't_1', '--worktree', 'current', '--agent', 'codex', '--model', 'gpt-5.6-terra', '--effort', 'high', '--json'])) throw new Error('worker-start 旗標不正確');
    const promptCalls = calls.filter((call) => call[0] === 'terminal');
    if (JSON.stringify(promptCalls) !== JSON.stringify([['terminal', 'read', '--terminal', 'term_1', '--json'], ['terminal', 'send', '--terminal', 'term_1', '--enter', '--json'], ['terminal', 'read', '--terminal', 'term_1', '--json']])) throw new Error('滯留 prompt 未補 Enter 後複驗');
    const saved = JSON.parse(readFileSync(pipelinePath, 'utf8'));
    const savedTicket = saved.tickets[0];
    if (saved.run_id !== 'r_1' || !Object.hasOwn(saved, 'pending_ack') || saved.pending_ack !== null || savedTicket.task_id !== 't_1' || savedTicket.dispatch_id !== 'd_1' || savedTicket.round !== 1 || savedTicket.status !== 'dispatched') throw new Error('pipeline 全欄位未落盤');

    writePipeline();
    const beforeFailure = readFileSync(pipelinePath, 'utf8');
    if (dispatch({ cwd: root, effort: 'x', ticketId: '01', invoke: (args) => args.includes('task-create') ? { task_id: 't_1' } : args.includes('dispatch-show') ? {} : {} }).ok) throw new Error('dispatch-show 空回應未失敗');
    if (readFileSync(pipelinePath, 'utf8') !== beforeFailure) throw new Error('orca 失敗仍修改 pipeline.json');

    writePipeline({ ticket: { status: 'rejected', dispatch_id: 'd_old' } });
    const redispatchCalls = [];
    const redispatchStub = (args) => { redispatchCalls.push(args); if (args.includes('task-create')) return { task_id: 't_2' }; if (args.includes('worker-start')) return { terminalHandle: 'term_2' }; if (args.includes('terminal') && args.includes('read')) return { output: 'prompt delivered' }; if (args.includes('dispatch-show')) return { dispatch_id: 'd_2' }; return {}; };
    const redispatch = dispatch({ cwd: root, effort: 'x', ticketId: '01', redispatch: true, invoke: redispatchStub });
    if (!redispatch.ok || redispatch.round !== 2 || JSON.stringify(redispatchCalls[0]) !== JSON.stringify(['orchestration', 'worker-release', '--dispatch', 'd_old', '--json'])) throw new Error('redispatch 未先 release 或 round 未加一');
    const roundTwoSpec = redispatchCalls.find((call) => call.includes('task-create'));
    if (!roundTwoSpec[roundTwoSpec.indexOf('--spec') + 1].includes(`；第 2 輪起先讀 ${join(scratch, 'reviews', '01.md')}。完整報告`)) throw new Error('第 2 輪 spec 分隔符不符合契約');
    if (redispatchCalls.some((call) => call[0] === 'terminal' && call.includes('send'))) throw new Error('未滯留 prompt 不得補送 Enter');
    process.stdout.write('dispatch self-test passed\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

function callIndex(call, value) { return call.indexOf(value); }

if (process.argv.includes('--self-test')) selfTest();
else {
  const result = dispatch(parseArgs(process.argv.slice(2)));
  if (!result.ok) { process.stderr.write(`${result.message}\n`); process.exit(result.code); }
  process.stdout.write(`${JSON.stringify({ ticket: result.ticket, task_id: result.task_id, dispatch_id: result.dispatch_id, round: result.round, status: result.status })}\n`);
}
