// SessionStart hook：把工作流規範注入每個 session（等效於全域 CLAUDE.md @ 匯入）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT;
if (root) {
  const files = ['preamble.md', 'workflow.md', 'reuse-first.md'];
  let out = '';
  for (const f of files) {
    try { out += readFileSync(join(root, 'rules', f), 'utf8') + '\n\n'; } catch {}
  }
  if (out) process.stdout.write(out);
}
