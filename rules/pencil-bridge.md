# Pencil（pen.dev）接線規範

適用範圍：只在 `/skeleton` 第 4 節「全站可點原型」與 design token。
schema 凍結後的 pencil 改動一律降級為 slice 路線 A；碰到模組進入點升 C 路線開票。
換真線階段禁用 Pencil。

實測基準：Pencil 1.2.0 / Windows。以下每條都對應一個實測結果，見 `PEN-TRIAL-1` 紀錄。

## 一、邊界（禁令）

1. Pencil MCP 只掛協調者，只做 `.pen` 的讀寫。禁止用它寫專案程式碼
2. Codex worker 禁止掛 Pencil MCP。worker 讀到的設計一律是協調者 dump 出來的 JSON 快照
3. 禁止使用 Pencil 內建的 coding agent（面板的 Set Repository → 產 React）。
   那條路繞過 dispatch 閘與 verify 閘
4. `Export(nodes,"html-tailwind",path)` 的產物禁止進 `src/`。
   它掛 `cdn.tailwindcss.com`（v3 play CDN）、全檔硬編 hex、零 `var(--)`，只能當參考稿

## 二、接線（每 session）

跑 `bin/pencil-preflight.ps1`，拿它印出的路徑當 MCP `filePath`。
不得手動排錯後才動工——手動排錯過的步驟一律回填進這支腳本。

已知限制，不得當成 bug 排查：
- MCP 自己開不了檔也建不了檔，必須先有 GUI 開檔
- Pencil 視窗不在前景時 canvas 不 render，`TakeScreenshot` 回全白
- `get_app_state(include_schema:true)` 約 15k tokens，每 session 只准呼叫一次

## 三、落盤（強制）

`Ctrl+S` 不會把設計寫進 `.pen`。Pencil library 裡那份是 275 bytes 的空殼。
設計完成後必須由協調者 dump：

```js
const v = GetVariables();
Print("PENDUMP" + JSON.stringify({
  version: "2.17", themes: v.themes || {}, variables: v.variables || {},
  children: Get((n, ctx) => { if (ctx.depth === 0) { ctx.skipChildren(); return n.id; } }, {depth: 1})
              .map(id => Get(id, {depth: 99}))
}));
```

協調者把 `PENDUMP` 後面那段 JSON 寫進 `design/<畫面組>.pen`，然後跑：

```
node bin/pen-verify.mjs design/<畫面組>.pen
```

不綠不得宣告設計完成，不得開票。

快照是**稽核物件**：可 diff、可進 commit、可當票的附件。
它不保證能被 Pencil 重新開啟（`imports` 的 library 參照無 API 可讀），
所以禁止把它當成唯一的設計來源反向重建。

## 四、開票

`.pen` 快照 → React component 這一步一律開票派 Codex Terra，過 verify 閘。
票必須附：快照路徑、`Export` 的 html 參考稿路徑、以及 hex → CSS 變數的對照表。
對照表缺一項即為票不完整，不得派工。
