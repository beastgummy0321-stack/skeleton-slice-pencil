// PEN-OPT-1  驗證 dump 出來的 .pen 快照是不是真的有東西。
// 用法：node bin/pen-verify.mjs <path.pen>
// 離開碼 0 = 通過；1 = 沒落盤或空殼
import { readFileSync, statSync } from "node:fs"

const path = process.argv[2]
if (!path) { console.error("用法: node bin/pen-verify.mjs <path.pen>"); process.exit(1) }

const bytes = statSync(path).size
let doc
try { doc = JSON.parse(readFileSync(path, "utf8")) } catch (e) {
  console.error(`FAIL 不是合法 JSON：${e.message}`); process.exit(1)
}

const children = Array.isArray(doc.children) ? doc.children : []
const count = (function walk(ns) {
  return ns.reduce((n, c) => n + 1 + walk(c.children ?? []), 0)
})(children)

// 1KB 門檻：Pencil 新建的空殼是 275 bytes，只有一個空 frame。
const ok = bytes > 1024 && children.length > 0 && count > 10
console.log(`${path}: ${bytes} bytes, ${children.length} 個頂層 frame, ${count} 個節點`)
if (!ok) { console.error("FAIL 看起來是空殼或沒落盤"); process.exit(1) }
console.log("OK")
