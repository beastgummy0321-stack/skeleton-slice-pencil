// ADR progressive disclosure. An unread file costs nothing, so nothing here caps how
// long an ADR is; what it caps is the surface that gets LOADED -- the one `decision:`
// line that stands for the ADR in every dispatch prompt, the way a skill's description
// stands for the skill. Bodies are read only when the filter names them.
//
// Two modes, one file:
//   hook (`--hook`, stdin JSON, PostToolUse) -- an ADR written without valid frontmatter is red.
//   CLI  (`node adr-index.mjs [path|module ...]`) -- prints the index rows that match,
//        computed from the frontmatter every time. There is no index file to drift.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const DECISION_MAX = 120;   // the loaded surface, not the file
const ADR_DIR = join('docs', 'adr');

const repoRoot = (cwd) => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return cwd; }
};

// `id`, `decision`, `status` are scalars; `applies-to` is `[a, b]` or a `- ` list.
export const parseFrontmatter = (text) => {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const fields = {};
  let key = null;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key) { (fields[key] = Array.isArray(fields[key]) ? fields[key] : []).push(unquote(item[1])); continue; }
    const pair = line.match(/^([a-z][\w-]*)\s*:\s*(.*)$/i);
    if (!pair) continue;
    key = pair[1].toLowerCase();
    const raw = pair[2].trim();
    if (raw === '') { fields[key] = []; continue; }
    fields[key] = raw.startsWith('[')
      ? raw.replace(/^\[|\]$/g, '').split(',').map((v) => unquote(v)).filter(Boolean)
      : unquote(raw);
  }
  return fields;
};
const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '').trim();
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Returns [] when the ADR is fit to be indexed; otherwise the reasons it is not.
export const validate = (fields, root) => {
  if (!fields) return ['no frontmatter block (the file must open with `---`)'];
  const problems = [];
  if (!/^\d{3,4}$/.test(String(fields.id ?? ''))) problems.push('`id:` must be the ADR number, e.g. `0042`');

  const status = String(fields.status ?? '');
  const superseded = /^superseded-by:\s*\d{3,4}$/.test(status);
  if (status !== 'in-force' && !superseded) problems.push('`status:` must be `in-force` or `superseded-by: NNNN`');

  const decision = String(fields.decision ?? '');
  if (!decision) problems.push('`decision:` is missing — one imperative sentence stating the ruling itself, not a summary of it');
  else if ([...decision].length > DECISION_MAX) problems.push(`\`decision:\` is ${[...decision].length} chars, max ${DECISION_MAX} — this line is loaded into every dispatch prompt; the reasoning belongs in the body, which has no limit`);

  const applies = list(fields['applies-to']);
  if (!applies.length) problems.push('`applies-to:` is missing — the paths or module dirs this decision governs, e.g. `[app/queue/, app/schedule/]`');
  // A superseded ADR governs nothing, so its paths are allowed to have been deleted.
  else if (!superseded) {
    const gone = applies.filter((p) => !existsSync(join(root, p)));
    if (gone.length) problems.push(`\`applies-to:\` names paths that do not exist: ${gone.join(', ')} — fix the path, or retire the ADR with \`status: superseded-by: NNNN\``);
  }
  return problems;
};

export const readAdrs = (root) => {
  const dir = join(root, ADR_DIR);
  let names;
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return names
    .filter((e) => e.isFile() && /\.md$/i.test(e.name) && !/^(README|INDEX)\.md$/i.test(e.name))
    .map((e) => {
      const path = join(dir, e.name);
      let fields = null;
      try { fields = parseFrontmatter(readFileSync(path, 'utf8')); } catch {}
      return { file: relative(root, path).split(sep).join('/'), fields, problems: validate(fields, root) };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
};

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
const touches = (appliesTo, filter) => appliesTo.some((a) => {
  const x = norm(a), y = norm(filter);
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`) || y.includes(x);
});

// ---- CLI: print the rows a dispatch prompt should carry -------------------------
const runCli = (argv) => {
  const root = repoRoot(process.cwd());
  const showAll = argv.includes('--all');
  const filters = argv.filter((a) => !a.startsWith('--'));
  const adrs = readAdrs(root);
  if (!adrs.length) { process.stdout.write(`no ADRs under ${ADR_DIR}/\n`); return 0; }

  const rows = [];
  const broken = [];
  for (const adr of adrs) {
    if (adr.problems.length) { broken.push(adr); continue; }
    const status = String(adr.fields.status);
    if (!showAll && status !== 'in-force') continue;
    const applies = list(adr.fields['applies-to']);
    if (filters.length && !filters.some((f) => touches(applies, f))) continue;
    rows.push(`${adr.fields.id}  ${adr.fields.decision}  [${applies.join(' ')}]${status === 'in-force' ? '' : `  (${status})`}`);
  }
  process.stdout.write(rows.length ? `${rows.join('\n')}\n` : `no ADR governs ${filters.join(' ') || 'this repo'}\n`);
  if (broken.length) {
    process.stdout.write(`\n${broken.length} ADR(s) have no usable frontmatter and are invisible to this index:\n`);
    for (const adr of broken) process.stdout.write(`  ${adr.file}  — ${adr.problems[0]}\n`);
  }
  return 0;
};

// ---- hook: an ADR is not written until it can be indexed ------------------------
const runHook = () => {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return 0; }
  const written = payload?.tool_input?.file_path;
  if (!written) return 0;
  const path = norm(written);
  if (!path.includes(`${ADR_DIR.split(sep).join('/')}/`) || !/\.md$/i.test(path)) return 0;
  if (/\/(retired|README|INDEX)/i.test(path)) return 0;

  const root = repoRoot(payload?.cwd || process.cwd());
  let text;
  try { text = readFileSync(written, 'utf8'); } catch { return 0; }
  const problems = validate(parseFrontmatter(text), root);
  if (!problems.length) return 0;

  process.stderr.write(
    `adr-index: ${path} cannot be indexed, so no dispatch prompt will ever surface it:\n` +
    problems.map((p) => `  - ${p}`).join('\n') + '\n' +
    'Every ADR opens with:\n' +
    '---\n' +
    'id: 0042\n' +
    'decision: <the ruling itself, one imperative sentence>\n' +
    'applies-to: [app/queue/, app/schedule/]\n' +
    'status: in-force\n' +
    '---\n' +
    'The body below it is read only when this ADR is named, and has no length limit.\n'
  );
  return 2;
};

const argv = process.argv.slice(2);
process.exit(argv.includes('--hook') ? runHook() : runCli(argv));
