// PreToolUse hook：dual 模式擋裸派工指令（含裸 codex exec），並保留合併閘。角色類閘門已隨雙台分工廢止刪除。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const tool = payload?.tool_name ?? '';
const cwd = payload?.cwd || process.cwd();
const block = (message) => { process.stderr.write(message); process.exit(2); };

function findPipelines() {
  const scratch = join(cwd, '.scratch');
  if (!existsSync(scratch)) return [];
  return readdirSync(scratch).flatMap((entry) => {
    const dir = join(scratch, entry);
    const path = join(dir, 'pipeline.json');
    try {
      if (!statSync(dir).isDirectory() || !existsSync(path)) return [];
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return data?.mode === 'dual' ? [{ path, data }] : [];
    } catch { return []; }
  });
}

const pipelines = findPipelines();
if (pipelines.length === 0) process.exit(0);
const ticketsOf = (pipeline) => Array.isArray(pipeline.data?.tickets) ? pipeline.data.tickets : [];

if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
const command = String(payload?.tool_input?.command ?? '');
const commandSegments = command.split(/&&|\|\||;|\||\r?\n/);
const matchesSegment = (pattern) => commandSegments.some((segment) => pattern.test(segment));
const usesBareCodexExec = commandSegments.some((segment) => /(^|[\\/"'])codex(\.exe)?["']?\s+exec\b/i.test(segment.trim()));
const usesDispatchCommand = matchesSegment(/^\s*orca\s+orchestration\s+worker-start\b(?![\w-])/) || matchesSegment(/^\s*orca\s+orchestration\s+dispatch\b(?![\w-])(?=[\s\S]*\s--inject\b)/);
const usesCheckCommand = matchesSegment(/^\s*orca\s+orchestration\s+check\b(?![\w-])/);

if (usesBareCodexExec || usesDispatchCommand || usesCheckCommand) {
  block('派工一律經 scripts/dispatch.mjs');
}

if (/\bgit\s+merge\b/.test(command)) {
  if (/--abort|--continue|--quit/.test(command)) process.exit(0);
  const stripped = command.replace(/(["'])(?:(?!\1)[\s\S])*\1/g, ' ');
  const match = stripped.match(/\bgit\s+merge\s+([\s\S]*)/);
  const branch = ((match?.[1] ?? '').split(/[\s;|&]+/).filter((part) => part && !part.startsWith('-')))[0] ?? '';
  if (branch.startsWith('origin/') || branch === 'FETCH_HEAD') process.exit(0);
  for (const pipeline of pipelines) {
    const tickets = ticketsOf(pipeline);
    const ticket = tickets.find((item) => item.branch === branch);
    if (!ticket) continue;
    if (ticket.status !== 'approved') block(`合併閘：票 ${ticket.id}（分支 ${branch}）狀態為 ${ticket.status}，只有 approved（已過審）可合併。`);
    const merging = tickets.find((item) => item.status === 'merging' && item.id !== ticket.id);
    if (merging) block(`合併閘：一次只合一線——票 ${merging.id} 正在合併中，等它落地並閘門綠了再合。`);
    if (ticket.migration && tickets.some((item) => item.id !== ticket.id && item.status === 'merged' && item.migration === ticket.migration)) block(`合併閘：migration 序號 ${ticket.migration} 與已合併票撞號。回報協調者重發序號。`);
    process.exit(0);
  }
  block(`合併閘：雙台模式下分支 ${branch || '(未解析)'} 不在任何 pipeline.json 的票上，未知線不得合入主幹。`);
}

process.exit(0);
