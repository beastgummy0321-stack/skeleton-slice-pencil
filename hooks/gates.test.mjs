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
  if (!result.stderr.includes('scripts/dispatch.mjs') || !result.stderr.includes('scripts/check.mjs')) throw new Error(`${command}: 未指向 wrapper 路徑`);
}
function writePipeline(tickets, mode = 'dual') {
  writeFileSync(join(root, '.scratch', 'x', 'pipeline.json'), JSON.stringify({ mode, approved: true, tickets }));
}
let base;
try {
  mkdirSync(join(root, '.scratch', 'x', 'issues'), { recursive: true });
  writePipeline([]);
  base = { cwd: root, tool_name: 'Bash', tool_input: { command: '' } };
  // 證紅方式：把 node scripts/dispatch.mjs 改成裸 worker-start，必須由綠轉紅。
  for (const command of ['orca orchestration worker-start --task x', 'orca orchestration dispatch --inject', 'orca orchestration check --wait', 'orca orchestration worker-start --task x # scripts/dispatch.mjs', 'node scripts/dispatch.mjs --ticket 01 && orca orchestration worker-start --task x']) expectWrapperBlock(command);
  expect(run({ ...base, tool_input: { command: 'node scripts/dispatch.mjs --ticket 01' } }), 0, 'dispatch wrapper');
  expect(run({ ...base, tool_input: { command: 'node scripts/check.mjs --timeout-ms 1' } }), 0, 'check wrapper');
  expect(run({ ...base, tool_input: { command: 'node scripts/dispatch.mjs --ticket 01 --cwd C:\\worker-start\\repo' } }), 0, 'worker-start path argument');
  expectWrapperBlock('node scripts/dispatch.mjs --ticket 01 && orca orchestration check --json');
  expect(run({ cwd: root, tool_name: 'Read', tool_input: { file_path: join(root, 'src', 'a.ts') } }, { SKELETON_ROLE: 'dispatch' }), 2, 'dispatch read outside whitelist');
  expect(run({ cwd: root, tool_name: 'Read', tool_input: { file_path: join(root, '.scratch', 'x', 'pipeline.json') } }, { SKELETON_ROLE: 'dispatch' }), 0, 'dispatch read pipeline');

  const issue = join(root, '.scratch', 'x', 'issues', '01.md');
  expect(run({ cwd: root, tool_name: 'Write', tool_input: { file_path: issue } }, { SKELETON_ROLE: 'dispatch' }), 2, 'dispatch Write issue');
  expect(run({ cwd: root, tool_name: 'Edit', tool_input: { file_path: issue } }, { SKELETON_ROLE: 'dispatch' }), 2, 'dispatch Edit issue');
  writePipeline([{ id: '01', status: 'dispatched' }]);
  expect(run({ cwd: root, tool_name: 'Write', tool_input: { file_path: join(root, '.scratch', 'x', 'pipeline.json') } }), 2, 'single writer pipeline');
  expect(run({ cwd: root, tool_name: 'Write', tool_input: { file_path: join(root, '.scratch', 'x', 'pipeline.json') } }, { SKELETON_ROLE: 'dispatch' }), 0, 'dispatch writes pipeline');
  expect(run({ cwd: root, tool_name: 'Write', tool_input: { file_path: join(root, '.scratch', 'x', 'pipeline-inbox.json') } }), 0, 'pipeline inbox write');

  writePipeline([{ id: '01', branch: 'line-01', status: 'pending' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }, { SKELETON_ROLE: 'dispatch' }), 2, 'merge pending ticket');
  writePipeline([{ id: '01', branch: 'line-01', status: 'approved' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }, { SKELETON_ROLE: 'dispatch' }), 0, 'merge approved ticket');
  writePipeline([{ id: '01', branch: 'line-01', status: 'approved' }, { id: '02', branch: 'line-02', status: 'merging' }]);
  expect(run({ ...base, tool_input: { command: 'git merge line-01' } }, { SKELETON_ROLE: 'dispatch' }), 2, 'single merge gate');

  writePipeline([], 'single');
  expect(run({ ...base, tool_input: { command: 'orca orchestration worker-start --task x' } }), 0, 'non-dual');
  process.stdout.write('gates self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
