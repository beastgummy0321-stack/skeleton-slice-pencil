import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hook = join(pluginRoot, 'hooks', 'load-budget.mjs');
const root = mkdtempSync(join(tmpdir(), 'budget-test-'));
function expectedRules() {
  const raw = readFileSync(join(pluginRoot, 'rules', 'code-rules.md'), 'utf8');
  const section = (title) => { const start = raw.indexOf(title); const end = raw.indexOf('\n## ', start + title.length); return raw.slice(start, end === -1 ? undefined : end).trim(); };
  return `${section('## 三、')}\n\n${section('## 六、')}\n\n${readFileSync(join(pluginRoot, 'rules', 'container-contract.md'), 'utf8').trim()}`;
}
function run(file) { return spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: file } }), encoding: 'utf8' }); }
function expect(result, code, name) { if (result.status !== code) throw new Error(`${name}: expected ${code}, got ${result.status}: ${result.stderr}`); }
try {
  mkdirSync(join(root, '.scratch', 'x', 'issues'), { recursive: true });
  const agents = join(root, 'AGENTS.md');
  const inline = `<!-- skeleton-slice:rules:begin -->\n${expectedRules()}\n<!-- skeleton-slice:rules:end -->\n`;
  writeFileSync(agents, inline);
  const issue = join(root, '.scratch', 'x', 'issues', '01.md');
  writeFileSync(issue, `${Array.from({ length: 151 }, () => 'x').join('\n')}\n`);
  // 證紅方式：把票檔多加第 151 行，此案必須由綠轉紅。
  expect(run(issue), 2, '151 line ticket');
  writeFileSync(issue, `${Array.from({ length: 150 }, () => 'x').join('\n')}\n`);
  expect(run(issue), 0, '150 line ticket');
  writeFileSync(agents, inline.replace('直接寫那個實作', '漂移'));
  expect(run(agents), 2, 'inline drift');
  writeFileSync(agents, inline);
  expect(run(agents), 0, 'inline restored');
  const ruleLines = expectedRules().split(/\r?\n/);
  const paddedRules = `${expectedRules()}${'\n'.repeat(200 - ruleLines.length)}`;
  const paddedInline = `<!-- skeleton-slice:rules:begin -->\n${paddedRules}\n<!-- skeleton-slice:rules:end -->\n@rules.md\n`;
  writeFileSync(agents, paddedInline);
  writeFileSync(join(root, 'rules.md'), `${Array.from({ length: 400 }, () => '規範').join('\n')}\n`);
  const inlineLineCount = paddedRules.split(/\r?\n/).length;
  const referencedRuleLineCount = readFileSync(join(root, 'rules.md'), 'utf8').trimEnd().split(/\r?\n/).length;
  if (inlineLineCount !== 200 || referencedRuleLineCount !== 400 || inlineLineCount + referencedRuleLineCount !== 600) throw new Error('內嵌與引用規範行數不符合 200＋400');
  expect(run(agents), 0, '200 line inline block excluded from gate A');
  process.stdout.write('budget self-test passed\n');
} finally { rmSync(root, { recursive: true, force: true }); }
