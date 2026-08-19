import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function commandParts(command) { return String(command).match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) ?? ['orca']; }
function invokeOrca(args) {
  const [command, ...prefix] = commandParts(process.env.ORCA_CLI_COMMAND || 'orca');
  const result = spawnSync(command, [...prefix, ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'orca command failed').trim().split(/\r?\n/)[0]);
  return JSON.parse((result.stdout || '{}').trim());
}
const first = (message) => String(message.body ?? message.text ?? '').split(/\r?\n/)[0] || '（無本文）';
const taskId = (message) => message.task_id ?? message.taskId ?? message.payload?.task_id ?? message.payload?.taskId;
const messagesOf = (result) => result.messages ?? result.result?.messages ?? result.data?.messages ?? [];
const deliveryOf = (result) => result.deliveryId ?? result.delivery_id ?? result.result?.deliveryId ?? result.result?.delivery_id;

export function check({ cwd, effort, timeoutMs = 600000, invoke = invokeOrca }) {
  const base = join(cwd, '.scratch');
  const selected = effort ? effort : (existsSync(base) ? readdirSync(base).filter((name) => existsSync(join(base, name, 'pipeline.json'))) : []);
  const effortName = Array.isArray(selected) ? selected[0] : selected;
  if (!effortName || (Array.isArray(selected) && selected.length !== 1)) return { ok: false, message: '--effort is required when .scratch has no unique pipeline', code: 2 };
  const scratch = join(base, effortName);
  const pipelinePath = join(scratch, 'pipeline.json');
  let pipeline;
  try { pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')); } catch { return { ok: false, message: '找不到或無法讀取 pipeline.json', code: 2 }; }
  const args = ['orchestration', 'check'];
  if (pipeline.pending_ack) args.push('--ack', pipeline.pending_ack);
  args.push('--wait', '--types', 'worker_done,escalation,question', '--timeout-ms', String(timeoutMs), '--json');
  let result;
  try { result = invoke(args); } catch (error) { return { ok: false, message: error.message, code: 1 }; }
  const messages = messagesOf(result);
  if (!messages.length) {
    // A4：連續空檢查點計數落盤，第三次起提示查活。
    pipeline.empty_checks = Number(pipeline.empty_checks || 0) + 1;
    writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);
    const lines = [`檢查點：無新訊息（連續第 ${pipeline.empty_checks} 次）`];
    if (pipeline.empty_checks >= 3) lines.push('連續 3 次空檢查點：跑 dispatch-show＋terminal read 查活（workflow.md 二）');
    return { ok: true, lines };
  }
  const reports = join(scratch, 'reports');
  mkdirSync(reports, { recursive: true });
  const lines = [];
  try {
    const inboxNumbers = readdirSync(reports)
      .map((name) => name.match(/^inbox-(\d+)\.md$/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    let inbox = inboxNumbers.length ? Math.max(...inboxNumbers) : 0;
    for (const message of messages) {
      const mid = taskId(message);
      const tickets = pipeline.tickets ?? [];
      const implTicket = tickets.find((item) => item.task_id === mid);
      const reviewTicket = tickets.find((item) => item.review_task_id === mid);
      const scoutTicket = tickets.find((item) => item.scout_task_id === mid);
      let reportPath;
      let skipIfExists = false;
      if (message.type === 'worker_done' && implTicket) {
        reportPath = join(reports, `${implTicket.id}-r${implTicket.round}-msg.md`);
        lines.push(`worker_done ｜票${implTicket.id}｜首行：${first(message)} ｜ .scratch/${effortName}/reports/${implTicket.id}-r${implTicket.round}-msg.md`);
      } else if (message.type === 'worker_done' && reviewTicket) {
        reportPath = join(reports, `${reviewTicket.id}-r${reviewTicket.round}-review-msg.md`);
        lines.push(`review_done｜票${reviewTicket.id}｜首行：${first(message)} ｜ .scratch/${effortName}/reports/${reviewTicket.id}-r${reviewTicket.round}-review-msg.md`);
        skipIfExists = true;
      } else if (message.type === 'worker_done' && scoutTicket) {
        reportPath = join(reports, `${scoutTicket.id}-prescan-msg.md`);
        lines.push(`scout_done｜票${scoutTicket.id}｜首行：${first(message)} ｜ .scratch/${effortName}/reports/${scoutTicket.id}-prescan-msg.md`);
        skipIfExists = true;
      } else {
        inbox += 1;
        reportPath = join(reports, `inbox-${inbox}.md`);
        lines.push(`${message.type ?? 'message'} ｜首行：${first(message)} ｜ .scratch/${effortName}/reports/inbox-${inbox}.md`);
      }
      if (!(skipIfExists && existsSync(reportPath))) writeFileSync(reportPath, `${JSON.stringify(message, null, 2)}\n`);
    }
    const deliveryId = deliveryOf(result);
    if (!deliveryId) throw new Error('check 回應缺 deliveryId');
    pipeline.pending_ack = deliveryId;
    pipeline.empty_checks = 0;
    if (pipeline.run_id === undefined) pipeline.run_id = null;
    writeFileSync(pipelinePath, `${JSON.stringify(pipeline, null, 2)}\n`);
    lines.push(`已收 ${messages.length} 則；deliveryId ${deliveryId} 已記入 pending_ack，下次呼叫自動簽收`);
    return { ok: true, lines };
  } catch (error) { return { ok: false, message: error.message, code: 1 }; }
}

function parseArgs(args) {
  const options = { cwd: process.cwd(), timeoutMs: 600000 };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--cwd') options.cwd = args[++index];
    if (args[index] === '--effort') options.effort = args[++index];
    if (args[index] === '--timeout-ms') options.timeoutMs = Number(args[++index]);
  }
  return options;
}

function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'check-test-'));
  try {
    const scratch = join(root, '.scratch', 'x');
    mkdirSync(join(scratch, 'reports'), { recursive: true });
    writeFileSync(join(scratch, 'pipeline.json'), JSON.stringify({ mode: 'dual', tickets: [{ id: '01', task_id: 't_1', review_task_id: 't_rv', scout_task_id: 't_sc', round: 1 }] }));
    writeFileSync(join(scratch, 'reports', 'inbox-1.md'), 'first');
    writeFileSync(join(scratch, 'reports', 'inbox-3.md'), 'third');
    const longReport = '既有 worker 長報告\n保留所有內容\n';
    writeFileSync(join(scratch, 'reports', '01-r1.md'), longReport);
    const calls = [];
    const body = Array.from({ length: 50 }, (_, index) => `第 ${index + 1} 行`).join('\n');
    const stub = (args) => {
      calls.push(args);
      return { deliveryId: 'ack_1', messages: [
        { type: 'worker_done', task_id: 't_1', body },
        { type: 'escalation', body: '需要裁決' },
      ] };
    };
    // 證紅方式：把 worker 訊息 task_id 改掉，報告不得再落到票 01。
    const result = check({ cwd: root, effort: 'x', invoke: stub });
    const workerReport = readFileSync(join(scratch, 'reports', '01-r1-msg.md'), 'utf8');
    if (!result.ok || !workerReport.includes('第 50 行') || result.lines.length > 3 * 2 + 2) throw new Error('50 行全文或 stdout 上限未通過');
    if (readFileSync(join(scratch, 'reports', '01-r1.md'), 'utf8') !== longReport) throw new Error('worker_done 覆寫既有長報告');
    if (!existsSync(join(scratch, 'reports', 'inbox-4.md')) || readFileSync(join(scratch, 'reports', 'inbox-3.md'), 'utf8') !== 'third') throw new Error('inbox 序號覆寫既有訊息');
    const saved = JSON.parse(readFileSync(join(scratch, 'pipeline.json'), 'utf8'));
    if (saved.pending_ack !== 'ack_1') throw new Error('pending_ack 未落盤');
    if (saved.empty_checks !== 0) throw new Error('A4：收到訊息後 empty_checks 未歸零落盤');

    // A4：連續空檢查點計數，第三次起附加查活提示；來訊後歸零（上面已驗證歸零，這裡驗證累加與第三次文案）。
    const emptyStub = () => ({ count: 0, messages: [] });
    const empty1 = check({ cwd: root, effort: 'x', invoke: emptyStub });
    if (!empty1.ok || empty1.lines[0] !== '檢查點：無新訊息（連續第 1 次）' || empty1.lines.length !== 1) throw new Error('第一次空檢查點文案或行數不正確');
    if (JSON.parse(readFileSync(join(scratch, 'pipeline.json'), 'utf8')).empty_checks !== 1) throw new Error('第一次空檢查點未落盤');
    const empty2 = check({ cwd: root, effort: 'x', invoke: emptyStub });
    if (empty2.lines[0] !== '檢查點：無新訊息（連續第 2 次）' || empty2.lines.length !== 1) throw new Error('第二次空檢查點不應附加查活提示');
    const empty3 = check({ cwd: root, effort: 'x', invoke: emptyStub });
    if (empty3.lines[0] !== '檢查點：無新訊息（連續第 3 次）' || !empty3.lines[1]?.includes('跑 dispatch-show')) throw new Error('第三次空檢查點未附加查活提示');
    if (JSON.parse(readFileSync(join(scratch, 'pipeline.json'), 'utf8')).empty_checks !== 3) throw new Error('第三次空檢查點未落盤');

    // 來訊後 empty_checks 歸零（沿用既有 stub，task_id 對不上任何欄位即走 inbox 分支）。
    const resetStub = () => ({ deliveryId: 'ack_reset', messages: [{ type: 'escalation', body: '喚醒' }] });
    check({ cwd: root, effort: 'x', invoke: resetStub });
    if (JSON.parse(readFileSync(join(scratch, 'pipeline.json'), 'utf8')).empty_checks !== 0) throw new Error('來訊後 empty_checks 未歸零');

    const secondCalls = [];
    const second = check({ cwd: root, effort: 'x', invoke: (args) => {
      secondCalls.push(args);
      return { count: 0, messages: [] };
    } });
    if (JSON.stringify(secondCalls[0]) !== JSON.stringify(['orchestration', 'check', '--ack', 'ack_reset', '--wait', '--types', 'worker_done,escalation,question', '--timeout-ms', '600000', '--json'])) throw new Error('呼叫未精確簽收 pending_ack');

    // A4：review_done／scout_done 標籤、檔名、既有檔不覆寫。
    const roundReportPath = join(scratch, 'reports', '01-r1-review-msg.md');
    writeFileSync(roundReportPath, 'existing review msg — must not be overwritten');
    const roleStub = () => ({ deliveryId: 'ack_role', messages: [
      { type: 'worker_done', task_id: 't_rv', body: '審查通過' },
      { type: 'worker_done', task_id: 't_sc', body: '預掃完成' },
    ] });
    const roleResult = check({ cwd: root, effort: 'x', invoke: roleStub });
    if (!roleResult.lines.some((line) => line.startsWith('review_done｜票01｜') && line.includes('01-r1-review-msg.md'))) throw new Error('review_done 標籤或檔名不正確');
    if (!roleResult.lines.some((line) => line.startsWith('scout_done｜票01｜') && line.includes('01-prescan-msg.md'))) throw new Error('scout_done 標籤或檔名不正確');
    if (readFileSync(roundReportPath, 'utf8') !== 'existing review msg — must not be overwritten') throw new Error('review_done 覆寫既有報告');
    if (!existsSync(join(scratch, 'reports', '01-prescan-msg.md'))) throw new Error('scout_done 報告未寫入');

    process.stdout.write('check self-test passed\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const result = check(parseArgs(process.argv.slice(2)));
  if (!result.ok) { process.stderr.write(`${result.message}\n`); process.exit(result.code); }
  process.stdout.write(`${result.lines.join('\n')}\n`);
}
