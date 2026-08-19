import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'gates-test-'));
const hook = join(dirname(fileURLToPath(import.meta.url)), 'pipeline-gates.mjs');
function run(payload, env = {}) {
  return spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, ...env } });
}
function expect(result, code, name) { if (result.status !== code) throw new Error(`${name}: expected ${code}, got ${result.status}: ${result.stderr}`); }
function expectWrapperBlock(command) {
  const result = run({ ...base, tool_input: { command } });
  expect(result, 2, command);
  if (!result.stderr.includes('scripts/dispatch.mjs')) throw new Error(`${command}: 未指向 wrapper 路徑`);
}
function writePipeline(tickets, mode = 'dual') {
  writeFileSync(join(root, '.scratch', 'x', 'pipeline.json'), JSON.stringify({ mode, approved: true, tickets }));
}
let base;
try {
  mkdirSync(join(root, '.scratch', 'x'), { recursive: true });
  writePipeline([]);
  base = { cwd: root, tool_name: 'Bash', tool_input: { command: '' } };
  // 證紅方式：把 node scripts/dispatch.mjs 改成裸 worker-start，必須由綠轉紅。
  for (const command of ['orca orchestration worker-start --task x', 'orca orchestration dispatch --inject', 'orca orchestration check --wait', 'orca orchestration worker-start --task x # scripts/dispatch.mjs', 'node scripts/dispatch.mjs --ticket 01 && orca orchestration worker-start --task x']) expectWrapperBlock(command);
  // 裸 codex exec 閘：證紅方式：把 codex exec 正則改壞（如把 exec 拼錯）看它綠→紅還原。
  for (const command of ['codex exec --task x', '"C:\\Users\\dev\\codex.exe" exec --task x', 'node scripts/dispatch.mjs --ticket 01 && codex exec --task x']) expectWrapperBlock(command);
  expect(run({ ...base, tool_input: { command: 'node scripts/dispatch.mjs --ticket 01' } }), 0, 'dispatch wrapper');
  expect(run({ ...base, tool_input: { command: 'npm test' } }), 0, 'plain command');
  expect(run({ ...base, tool_input: { command: 'node scripts/dispatch.mjs --ticket 01 --cwd C:\\worker-start\\repo' } }), 0, 'worker-start path argument');
  // 新案：路徑含 codex/exec 字樣但非「codex exec」指令，證新正則不誤傷 wrapper 呼叫。
  expect(run({ ...base, tool_input: { command: 'node scripts/dispatch.mjs --ticket 01 --cwd C:\\codex\\exec-repo' } }), 0, 'codex exec-like path argument');
  expectWrapperBlock('node scripts/dispatch.mjs --ticket 01 && orca orchestration check --json');

  // v3 單台調度：合併閘不吃 SKELETON_ROLE，approved 票在不設該 env 時也要能合、pending 票仍擋。
  writePipeline([{ id: '01', branch: 'line-01', status: 'pending' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }), 2, 'merge pending ticket, no SKELETON_ROLE');
  writePipeline([{ id: '01', branch: 'line-01', status: 'approved' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }), 0, 'merge approved ticket, no SKELETON_ROLE');
  writePipeline([{ id: '01', branch: 'line-01', status: 'approved' }, { id: '02', branch: 'line-02', status: 'merging' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }), 2, 'single merge gate, no SKELETON_ROLE');

  writePipeline([], 'single');
  expect(run({ ...base, tool_input: { command: 'orca orchestration worker-start --task x' } }), 0, 'non-dual');
  expect(run({ ...base, tool_input: { command: 'codex exec --task x' } }), 0, 'non-dual codex exec');
  process.stdout.write('gates self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
