# Pencil（pen.dev）接線規範

適用範圍：只在 `/skeleton` 第 4 節「全站可點原型」與 design token。
schema 凍結後的 pencil 改動一律降級為 slice 路線 A；碰到模組進入點升 C 路線開票。
換真線階段禁用 Pencil。

實測基準：Pencil 1.2.0 / Windows 11 / 2026-08-20 兩輪試跑。
每條規則對應一個實測結果；標「未驗」者不得當成事實引用。

## 一、邊界（禁令）

1. Pencil MCP 只掛協調者，只做設計檔的讀寫。禁止用它寫專案程式碼
2. 實作 subagent 禁止掛 Pencil MCP。subagent 讀到的設計一律是協調者 dump 出來的 JSON 快照
3. 禁止使用 Pencil 內建的 coding agent（面板的 Set Repository → 產 React）。
   那條路繞過規格凍結與機器組交件閘
4. `Export(nodes,"html-tailwind",path)` 的產物禁止進 `src/`。
   實測兩份 export：`var(--)` 出現 0 次、硬編 hex 88 處、掛 `cdn.tailwindcss.com`（v3 play CDN）
5. `src/` 禁止出現未登記在 `globals.css` 的色票 hex。
   設計裡建了變數卻沒接進 `globals.css`，等於孤兒變數＋硬編色，兩邊都算違規

## 二、開檔（每 session，半自動）

跑 `bin/pencil-preflight.ps1 -DesignDir <設計資料夾>`：
- 離開碼 0：已開檔，最後一行是 `.pen` 路徑，拿去當 MCP `filePath`
- 離開碼 2：需要人在 GUI 點一下 New File（或 DESIGN SYSTEMS → shadcn/ui），再重跑

**唯一可靠的建檔方式是在 GUI 點。** 已知不可行、不得再試：
- MCP 自己開不了檔也建不了檔（所有工具都要求編輯器裡已有開檔）
- 命令列帶路徑二次啟動雖然會開檔，但**開出來的文件不含檔案內容**
  （實測：18,875 bytes 的檔案開起來 `Get` 不到裡面任何節點），
  且之後 `Insert` 的節點不 render。此路禁用
- 手寫的種子 `.pen`（`{"version":"2.17","children":[]}`）同上
- `Ctrl+S` 不會把設計寫進檔案（實測含 file-backed 文件）
- 儀表板的 a11y tree 有時整個不曝露（只回 260 bytes），此時腳本代點必然失敗

## 三、元件庫

Pencil 的 shadcn/ui library 帶進 90+ 個 component 與 28 個 **與 shadcn 同名**的變數
（`--background`／`--primary`／`--muted-foreground`…），是最省事的起手式。
但匯入只能在 GUI 點 Libraries → Shadcn UI，**沒有 MCP API**。

點不到時的替代：用 `SetVariables` 自建同名變數，再用 primitive 拼版。
兩者都可接受，但同一份設計不得混用。

## 四、落盤（強制）

Pencil 沒有可依賴的存檔行為：
- 曾觀察到它自動把設計寫成 `<啟動時工作目錄>/…/untitled.pen`（18,875 bytes，含 library 變數參照），
  **但機制不明、無法重現。不得依賴，不得寫進流程**
- 因此落盤一律由協調者 dump：

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

成本與限制（必須知道再用）：
- dump 會經過協調者 context。實測 3 個畫面／116 節點 ＝ 17.6KB ≈ 6k tokens，畫面越多越貴
- dump **丟失 `imports`**（library 參照無 API 可讀）。快照是稽核物件：可 diff、可進 commit、
  可當票的附件；**不保證能被 Pencil 重新開啟**，禁止拿它反向重建設計

## 五、目視驗證（強制）

`TakeScreenshot` 與 `Export(...,"png",...)` 實測對所有節點回傳空白，
含「一個文字＋一個色塊」的最小 probe，前景也一樣。改走這條：

1. `Export(screens, "html-tailwind", "<repo>/design/<畫面組>.html")`
2. 把該 html 放到專案 dev server 的 `public/`，用瀏覽器截圖
3. 用完刪掉 `public/` 那份，不得留在 repo

設計截圖與實作截圖**必須並排比對**，差異逐條列進票裡。
只驗設計、不回頭比對，等於沒有攔截實作偏離設計的關卡。

## 六、開票

設計快照 → React component 這一步一律開票派 Sonnet，過機器組交件閘。
票必須附：快照路徑、html 參考稿路徑、hex → CSS 變數對照表、設計 vs 實作差異清單。
缺任一項即為票不完整，不得派工。
