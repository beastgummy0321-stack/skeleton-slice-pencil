// SessionStart hook: inject the workflow rules into every session (what a global CLAUDE.md
// @-import would do). The last line prints the injected size, so creep is visible without a gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT;
if (root) {
  let out = '';
  for (const f of ['preamble.md', 'workflow.md', 'reuse-first.md']) {
    // {{PLUGIN_ROOT}} resolves here, so a command the rules name is runnable as printed.
    try { out += readFileSync(join(root, 'rules', f), 'utf8').replaceAll('{{PLUGIN_ROOT}}', root) + '\n\n'; } catch {}
  }
  if (out) process.stdout.write(out + `(injected ${(Buffer.byteLength(out) / 1024).toFixed(1)} KB)\n`);
}
