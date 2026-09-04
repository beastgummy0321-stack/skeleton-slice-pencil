// BOARD.md holds goals -- one line each -- and nothing else. The details of a goal live in
// docs/issues/<goal>/ (tickets `NN-<name>.md`, issues `issue-<name>.md`).
//
// Measured: the prose rule "只放未開始＋進行中；完成即刪行" sat on line 1 of a real board while the
// board grew to 449 lines, 13 sections, two competing orderings, four sections of measured facts,
// one section of finished work and fourteen 10-line "small debt" rows. Every other rule funnels
// knowledge here ("現在做到哪只活在 BOARD.md", "另寫說明文件不是出口", "票死即刪"), and no gate
// pushed back. A board nobody may write prose into needs a gate that reads it, not a first line.
//
// Runs as: PostToolUse on Write|Edit (`--hook`, stdin JSON) when the file is BOARD.md, and at
// every Agent dispatch via ticket-fields.mjs (a board written by Bash heredoc is caught there).
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

// One screen. The user's own diagram had three modules under the goal; nine is the ceiling
// a screen holds without scrolling. May only go down.
export const MAX_ROWS = 9;
// One line. A row that needs a second line is a row hiding an issue file.
export const MAX_ROW_CHARS = 200;

const ROW = /^- \[( |>|skeleton>)\] /;
const FOLDER = /docs\/issues\/[\w.-]+\//;

export function checkBoard(text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  if (!/^# /.test(lines[0] ?? '')) problems.push('line 1 is not the `# ` title');
  let rows = 0;
  lines.forEach((line, i) => {
    if (i === 0 || !line.trim()) return;
    const n = i + 1;
    if (/^> /.test(line)) return; // the pointer line (constitution, the one-sentence goal)
    if (ROW.test(line)) {
      rows++;
      if (line.length > MAX_ROW_CHARS) problems.push(`line ${n}: row is ${line.length} chars; a row is one line (<=${MAX_ROW_CHARS}) -- the rest is that goal's spec.md or an issue file`);
      if (!FOLDER.test(line)) problems.push(`line ${n}: row names no docs/issues/<goal>/ folder -- a goal with no folder has nowhere to put its tickets, so they end up here`);
      return;
    }
    problems.push(`line ${n}: neither a row, the title, nor a \`> \` pointer -- sections, paragraphs, indented continuations and measured facts do not live on the board`);
  });
  if (rows > MAX_ROWS) problems.push(`${rows} rows; the board holds at most ${MAX_ROWS} goals -- a row that is not a goal is an issue file under one`);
  return problems;
}

export function boardPath(cwd) {
  let root = cwd;
  try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const p = join(root, 'BOARD.md');
  return existsSync(p) ? p : null;
}

// Every problem the board has, or [] when there is no board (a project not on this workflow).
export function sweepBoard(cwd) {
  const p = boardPath(cwd);
  return p ? checkBoard(readFileSync(p, 'utf8')) : [];
}

export function report(problems, where) {
  const shown = problems.slice(0, 8);
  return `board-shape: ${where} is not a board (${problems.length} problem${problems.length === 1 ? '' : 's'}).\n` +
    shown.map((p) => `  - ${p}`).join('\n') + (problems.length > shown.length ? `\n  ... and ${problems.length - shown.length} more` : '') + '\n' +
    'A board is: `# ` title, `> ` pointer lines, then one `- [ ] <goal> ... docs/issues/<goal>/` row per goal.\n' +
    'Measured facts go to the module contract page or CONTEXT.md; a defect found mid-ticket goes to\n' +
    'docs/issues/<goal>/issue-<name>.md; finished work is deleted (git log is the archive).\n';
}

function runHook() {
  let payload;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch {
    process.stderr.write('board-shape: the hook payload is not JSON; a gate that cannot read its input does not pass it.\n');
    return 2;
  }
  const file = String(payload?.tool_input?.file_path ?? '');
  if (basename(file) !== 'BOARD.md') return 0;
  if (!existsSync(file)) return 0;
  const problems = checkBoard(readFileSync(file, 'utf8'));
  if (!problems.length) return 0;
  process.stderr.write(report(problems, file));
  return 2;
}

function runCli(argv) {
  const file = argv[0] || boardPath(process.cwd());
  if (!file || !existsSync(file)) { process.stderr.write('board-shape: no BOARD.md here\n'); return 1; }
  const problems = checkBoard(readFileSync(file, 'utf8'));
  if (!problems.length) { process.stdout.write(`board-shape: ${file} ok\n`); return 0; }
  process.stderr.write(report(problems, file));
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  process.exit(argv.includes('--hook') ? runHook() : runCli(argv.filter((a) => a !== '--hook')));
}
