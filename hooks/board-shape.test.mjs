import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkBoard, MAX_ROWS } from './board-shape.mjs';

const hook = join(dirname(fileURLToPath(import.meta.url)), 'board-shape.mjs');
const root = mkdtempSync(join(tmpdir(), 'board-shape-test-'));
const board = join(root, 'BOARD.md');

const onWrite = (path) => spawnSync(process.execPath, [hook, '--hook'], {
  input: JSON.stringify({ cwd: root, tool_name: 'Write', tool_input: { file_path: path } }),
  encoding: 'utf8',
});
const expect = (r, code, name) => { if (r.status !== code) throw new Error(`${name}: expected ${code}, got ${r.status}: ${r.stderr}${r.stdout}`); };
const red = (text, needle, name) => {
  const p = checkBoard(text);
  if (!p.length) throw new Error(`${name}: expected red, got green`);
  if (!p.some((x) => x.includes(needle))) throw new Error(`${name}: expected a problem mentioning "${needle}", got:\n${p.join('\n')}`);
};
const green = (text, name) => { const p = checkBoard(text); if (p.length) throw new Error(`${name}: expected green, got:\n${p.join('\n')}`); };

const GOOD = [
  '# 看板（每行一個目標；細節在 docs/issues/<目標>/；目標完成即刪行）',
  '',
  '> 憲法：CONSTITUTION.md ｜ 總目標：在本機把廣告閉環完整跑完一輪',
  '',
  '- [>] G1 廣告閉環 ⑧⑨ ｜ docs/issues/ad-loop/ ｜ 卡在你：把廣告 02/03 貼進 Meta 並打開',
  '- [ ] G2 閘門 ｜ docs/issues/gates/',
  '- [skeleton>] 站三原型 ｜ docs/issues/proto/ ｜ 第 4 頁',
  '',
].join('\n');

try {
  green(GOOD, 'a board of rows passes');

  // proven red, four ways -- each is a shape the real 449-line board actually had
  red(GOOD + '\n## 仍然成立的事實\n\n- 三層花費完全相等（各 63,464 TWD）\n', 'neither a row', 'a section of measured facts');
  red(GOOD + '- [ ] G3 小債 ｜ docs/issues/debt/\n      `_row_hash()` 對 int／float 不穩定，今天靠一道隱性防線擋著\n', 'neither a row', 'an indented continuation line');
  red(GOOD + '- [ ] G3 ' + 'x'.repeat(220) + ' docs/issues/debt/\n', 'chars', 'a row that is a paragraph');
  red(GOOD + '- [ ] G3 小債，沒有資料夾\n', 'names no docs/issues', 'a row with no folder');
  red(GOOD + Array.from({ length: MAX_ROWS }, (_, i) => `- [ ] R${i} ｜ docs/issues/r${i}/`).join('\n') + '\n', 'at most', `${MAX_ROWS + 3} rows`);
  red('看板\n- [ ] G1 ｜ docs/issues/g1/\n', 'title', 'no title line');

  // hook mode: only BOARD.md is judged; a broken board fails the Write that produced it
  writeFileSync(board, GOOD + '## 里程碑\n\n第一段 $0——整套在本機跑通\n');
  expect(onWrite(board), 2, 'hook: prose on the board fails the write');
  expect(onWrite(join(root, 'CONTEXT.md')), 0, 'hook: another file is not judged');
  writeFileSync(board, GOOD);
  expect(onWrite(board), 0, 'hook: a board of rows passes');
  expect(spawnSync(process.execPath, [hook, '--hook'], { input: '{not json', encoding: 'utf8' }), 2, 'hook: malformed payload fails closed');

  // cli mode
  expect(spawnSync(process.execPath, [hook, board], { encoding: 'utf8' }), 0, 'cli: ok');
  writeFileSync(board, GOOD + '\n## 小債\n');
  expect(spawnSync(process.execPath, [hook, board], { encoding: 'utf8' }), 2, 'cli: red');

  console.log('board-shape: all tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
