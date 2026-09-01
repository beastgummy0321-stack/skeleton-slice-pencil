// ADR progressive disclosure. An unread file costs nothing, so nothing here caps how
// long an ADR is; what it caps is the surface that gets LOADED -- the one `decision:`
// line that stands for the ADR in every dispatch prompt, the way a skill's description
// stands for the skill. Bodies are read only when the filter names them.
//
// Three modes, one file:
//   hook (`--hook`, stdin JSON, PostToolUse) -- fast feedback while an ADR is being written.
//   CLI  (`node adr-index.mjs [path|module ...]`) -- prints the index rows that match,
//        computed from the frontmatter every time. There is no index file to drift.
//   sweep(root) -- imported by the dispatch gate. The write-time hook only ever sees a
//        Write/Edit to one file, so everything that arrives another way (a Bash heredoc,
//        a rename that strands an applies-to, a second file claiming the same id) walks
//        straight past it. The sweep reads every ADR on disk, however it got there, and
//        runs at the one moment a stale decision does damage: dispatching an agent.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const DECISION_MAX = 120;   // the loaded surface, not the file
const ADR_DIR = join('docs', 'adr');
const ADR_POSIX = ADR_DIR.split(sep).join('/');

const repoRoot = (cwd) => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return cwd; }
};

// `id`, `decision`, `status`, `supersedes` are scalars; `applies-to` and `supersedes`
// may also be `[a, b]` or a `- ` list.
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

const norm = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
const segs = (p) => norm(p).split('/').filter(Boolean);
// Segment-wise, so `app/l` does not match `app/llm/gateway.py`; a shorter path governs
// everything below it, which is what "this decision covers this directory" means.
const under = (a, b) => {
  const x = segs(a), y = segs(b), n = Math.min(x.length, y.length);
  return n > 0 && x.slice(0, n).every((s, i) => s === y[i]);
};
const touches = (appliesTo, filter) => appliesTo.some((a) => under(a, filter));
export const overlaps = (a, b) => a.some((x) => b.some((y) => under(x, y)));

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

  if (!('supersedes' in fields)) problems.push('`supersedes:` is missing — the ADR ids this one replaces, or `none`. It is asked of every ADR because the answer is what retires the old decision; a wrong answer here is how two contradictory rulings end up both in force.');
  else {
    const sup = list(fields.supersedes);
    const bad = sup.filter((v) => v !== 'none' && !/^\d{3,4}$/.test(v));
    if (bad.length) problems.push(`\`supersedes:\` must be \`none\` or ADR ids: ${bad.join(', ')} is neither`);
    if (sup.length > 1 && sup.includes('none')) problems.push('`supersedes:` cannot be both `none` and a list of ids');
  }

  const applies = list(fields['applies-to']);
  if (!applies.length) problems.push('`applies-to:` is missing — the paths or module dirs this decision governs, e.g. `[app/queue/, app/schedule/]`');
  // A superseded ADR governs nothing, so its paths are allowed to have been deleted.
  else if (!superseded) {
    const gone = applies.filter((p) => !existsSync(join(root, p)));
    if (gone.length) problems.push(`\`applies-to:\` names paths that do not exist: ${gone.join(', ')} — fix the path, or retire the ADR with \`status: superseded-by: NNNN\``);
  }
  return problems;
};

// Every .md under docs/adr, at any depth, so a nested file is caught rather than vanishing.
const walk = (dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (!/^retired$/i.test(e.name)) walk(full, out); }
    else if (/\.md$/i.test(e.name) && !/^(README|INDEX)\.md$/i.test(e.name)) out.push(full);
  }
  return out;
};

export const readAdrs = (root) => {
  const dir = join(root, ADR_DIR);
  try { if (!statSync(dir).isDirectory()) return []; } catch { return []; }
  return walk(dir)
    .map((path) => {
      const file = relative(root, path).split(sep).join('/');
      let fields = null;
      try { fields = parseFrontmatter(readFileSync(path, 'utf8')); } catch {}
      const problems = validate(fields, root);
      // ADRs live directly in docs/adr/. One folder deeper and the dispatch surface
      // never carries it, which is worse than a red gate: it is a signed decision nobody
      // is ever shown.
      if (relative(join(root, ADR_DIR), path).split(sep).length > 1) {
        problems.push(`filed in a subfolder — ADRs live directly in ${ADR_POSIX}/ (or ${ADR_POSIX}/retired/), or no dispatch prompt will ever surface this one`);
      }
      return { file, fields, problems };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
};

// Everything the write-time hook structurally cannot see, because it only ever gets one file.
export const sweep = (root) => {
  const adrs = readAdrs(root);
  if (!adrs.length) return { problems: [], warnings: [] };
  const problems = [];
  const warnings = [];

  for (const a of adrs) for (const p of a.problems) problems.push(`${a.file} — ${p}`);

  const ok = adrs.filter((a) => !a.problems.length);
  const byId = new Map();
  for (const a of ok) {
    const id = String(a.fields.id);
    if (byId.has(id)) problems.push(`${a.file} — id ${id} is already used by ${byId.get(id).file}; a contract page citing "${id}" cannot say which one it means`);
    else byId.set(id, a);
  }

  // Retirement is a link, and a link has two ends. Either end alone is a decision that
  // looks retired from one side and binding from the other.
  for (const a of ok) {
    const id = String(a.fields.id);
    for (const target of list(a.fields.supersedes).filter((v) => v !== 'none')) {
      const t = byId.get(target);
      if (!t) { problems.push(`${a.file} — supersedes ${target}, which is not an in-force ADR here`); continue; }
      if (String(t.fields.status) !== `superseded-by: ${id}`) {
        problems.push(`${a.file} — supersedes ${target}, but ${t.file} still reads \`status: ${t.fields.status}\`; set it to \`superseded-by: ${id}\` or drop the claim`);
      }
    }
    const m = String(a.fields.status).match(/^superseded-by:\s*(\d{3,4})$/);
    if (m) {
      const by = byId.get(m[1]);
      if (!by) problems.push(`${a.file} — retired by ${m[1]}, which does not exist; the decision that replaced it cannot be read`);
      else if (!list(by.fields.supersedes).includes(id)) problems.push(`${a.file} — says ${m[1]} replaced it, but ${by.file} does not list ${id} under \`supersedes:\``);
    }
  }

  // Contract pages cite ADRs by id and nothing else; a dead id sends an agent hunting.
  const cdir = join(root, 'docs', 'contracts');
  let pages = [];
  try { pages = readdirSync(cdir).filter((f) => /\.md$/i.test(f)); } catch {}
  for (const page of pages) {
    let text = '';
    try { text = readFileSync(join(cdir, page), 'utf8'); } catch { continue; }
    const section = text.match(/decisions in force[^\n]*\n?([\s\S]*?)(?=\n#|$)/i);
    for (const id of new Set((section ? section[0] : '').match(/\b\d{4}\b/g) ?? [])) {
      const t = byId.get(id);
      if (!t) problems.push(`docs/contracts/${page} — cites ADR ${id}, which is not an in-force ADR`);
      else if (String(t.fields.status) !== 'in-force') warnings.push(`docs/contracts/${page} — cites ADR ${id}, which is ${t.fields.status}`);
    }
  }

  // Not a gate: a repo-wide decision legitimately claims a repo-wide path. It is still
  // worth naming, because one over-broad applies-to puts itself back into every prompt.
  const inForce = ok.filter((a) => String(a.fields.status) === 'in-force');
  for (const a of inForce) {
    const hit = inForce.filter((b) => b !== a && overlaps(list(a.fields['applies-to']), list(b.fields['applies-to']))).length;
    if (inForce.length > 4 && hit > inForce.length / 2) {
      warnings.push(`${a.file} — applies-to [${list(a.fields['applies-to']).join(' ')}] overlaps ${hit} of ${inForce.length - 1} other in-force ADRs; it will ride along in nearly every dispatch prompt`);
    }
  }
  return { problems, warnings };
};

// ---- CLI: print the rows a dispatch prompt should carry -------------------------
const runCli = (argv) => {
  const root = repoRoot(process.cwd());
  const showAll = argv.includes('--all');
  const filters = argv.filter((a) => !a.startsWith('--'));
  const adrs = readAdrs(root);
  if (!adrs.length) { process.stdout.write(`no ADRs under ${ADR_POSIX}/\n`); return 0; }

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
  const { problems, warnings } = sweep(root);
  const cross = problems.filter((p) => !broken.some((b) => p.startsWith(`${b.file} `)));
  if (cross.length) process.stdout.write(`\n${cross.length} cross-ADR problem(s):\n${cross.map((p) => `  ${p}\n`).join('')}`);
  if (warnings.length) process.stdout.write(`\n${warnings.length} warning(s):\n${warnings.map((w) => `  ${w}\n`).join('')}`);
  return 0;
};

// ---- hook: fast feedback on the ADR being written -------------------------------
const runHook = () => {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { return 0; }
  const written = payload?.tool_input?.file_path;
  if (!written) return 0;
  const path = norm(written);
  if (!path.includes(`${ADR_POSIX}/`) || !/\.md$/i.test(path)) return 0;
  if (/\/(retired|README|INDEX)/i.test(path)) return 0;

  const root = repoRoot(payload?.cwd || process.cwd());
  let text;
  try { text = readFileSync(written, 'utf8'); } catch {
    process.stderr.write(`adr-index: cannot read ${path}; the gate could not run on it.\n`);
    return 2;
  }
  const fields = parseFrontmatter(text);
  const problems = validate(fields, root);
  if (!problems.length) return 0;

  // Missing `supersedes` is the one problem whose answer needs evidence, so hand the
  // evidence over: the in-force decisions this one lands on top of.
  let neighbours = '';
  if (fields && problems.some((p) => p.startsWith('`supersedes:`'))) {
    const mine = list(fields['applies-to']);
    const near = readAdrs(root)
      .filter((a) => !a.problems.length && String(a.fields.status) === 'in-force'
        && String(a.fields.id) !== String(fields.id) && overlaps(mine, list(a.fields['applies-to'])))
      .map((a) => `  ${a.fields.id}  ${a.fields.decision}`);
    if (near.length) neighbours = `In force on the same paths — does this one replace any of them?\n${near.join('\n')}\n`;
  }

  process.stderr.write(
    `adr-index: ${path} cannot be indexed, so no dispatch prompt will ever surface it:\n` +
    problems.map((p) => `  - ${p}`).join('\n') + '\n' + neighbours +
    'Every ADR opens with:\n---\nid: 0042\ndecision: <the ruling itself, one imperative sentence>\n' +
    'applies-to: [app/queue/, app/schedule/]\nsupersedes: none\nstatus: in-force\n---\n' +
    'The body below it is read only when this ADR is named, and has no length limit.\n'
  );
  return 2;
};

// Only when run directly: the dispatch gate imports sweep() from here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  process.exit(argv.includes('--hook') ? runHook() : runCli(argv));
}
