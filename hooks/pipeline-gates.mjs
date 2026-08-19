// PreToolUse hook：dual 模式只留 wrapper 派工入口，並保留合併、角色與單一寫手閘。
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const tool = payload?.tool_name ?? '';
const cwd = payload?.cwd || process.cwd();
const role = process.env.SKELETON_ROLE === 'dispatch' ? 'dispatch' : 'conversation';
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const norm = (value) => String(value).replace(/\\/g, '/').toLowerCase();
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
const inFlight = new Set(['dispatched', 'approved', 'merging']);

if (tool === 'Read' && role === 'dispatch') {
  const filePath = norm(payload?.tool_input?.file_path ?? '');
  const allowedNames = new Set(['board.md', 'agents.md', 'claude.md', 'pipeline.json', 'pipeline-inbox.json']);
  const allowed = filePath.includes('/.scratch/') || allowedNames.has(basename(filePath)) || filePath.startsWith(norm(pluginRoot) + '/');
  if (!allowed) block('調度台唯讀白名單外——派 Luna／審查 worker 去讀');
  process.exit(0);
}

if (tool === 'Write' || tool === 'Edit') {
  const filePath = norm(payload?.tool_input?.file_path ?? '');
  if (!filePath) process.exit(0);
  if (filePath.endsWith('pipeline-inbox.json')) process.exit(0);
  if (filePath.endsWith('pipeline.json') && filePath.includes('/.scratch/')) {
    if (role === 'dispatch') process.exit(0);
    const pipeline = pipelines.find((item) => norm(item.path) === filePath);
    if (pipeline && ticketsOf(pipeline).some((ticket) => inFlight.has(ticket.status))) {
      block('單一寫手閘：有票在飛時 pipeline.json 狀態欄只准調度台寫。對話台新增票請寫同目錄 pipeline-inbox.json，由調度台併入。');
    }
    process.exit(0);
  }
  if (role === 'dispatch' && /\/\.scratch\/[^/]+\/issues\/[^/]+\.md$/.test(filePath) && !filePath.includes('review') && !basename(filePath).includes('hotfix')) {
    block('角色閘：調度台不得修改規格票（工頭不改規格）。規格問題寫入同目錄 escalations.md 並停該票，由對話台帶使用者裁決。');
  }
  process.exit(0);
}

if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
const command = String(payload?.tool_input?.command ?? '');
const commandSegments = command.split(/&&|\|\||;|\||\r?\n/);
const startsWithOrca = (pattern) => commandSegments.some((segment) => pattern.test(segment));
const usesDispatchCommand = startsWithOrca(/^\s*orca\s+orchestration\s+worker-start\b(?![\w-])/) || startsWithOrca(/^\s*orca\s+orchestration\s+dispatch\b(?![\w-])(?=[\s\S]*\s--inject\b)/);
const usesCheckCommand = startsWithOrca(/^\s*orca\s+orchestration\s+check\b(?![\w-])/);

if (usesDispatchCommand || usesCheckCommand) {
  block('雙台派工／收訊一律經 scripts/dispatch.mjs 或 scripts/check.mjs，禁止直接呼叫 Orca 指令。');
}

if (/\bgit\s+merge\b/.test(command)) {
  if (/--abort|--continue|--quit/.test(command)) process.exit(0);
  const stripped = command.replace(/(["'])(?:(?!\1)[\s\S])*\1/g, ' ');
  const match = stripped.match(/\bgit\s+merge\s+([\s\S]*)/);
  const branch = ((match?.[1] ?? '').split(/[\s;|&]+/).filter((part) => part && !part.startsWith('-')))[0] ?? '';
  if (branch.startsWith('origin/') || branch === 'FETCH_HEAD') process.exit(0);
  if (role === 'conversation') block('角色閘：雙台模式下合併主幹歸調度台。');
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
