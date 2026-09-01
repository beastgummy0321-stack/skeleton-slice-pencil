# skeleton-slice-pencil

**這是 skeleton-slice 的 Pencil 版**（v5.0.0，分支自原版 v3.1.0 / c51e38d）。
4.0.0 起規範自行演進、不再與原版同步；另外加上 pen.dev（Pencil）設計檔的接線邊界與腳本。
與原版可並存，擇一啟用。不用 Pencil 的專案裝原版就好，本版對你沒有好處。

可攜的 Claude Code 開發工作流 plugin。一次安裝，整套帶走：

```
/setup-workflow（每台機器一次）  裝外部依賴＋環境檢查
/skeleton     （每專案一次）    訪談樹引導 → 地基 → 全站可點原型 → 看板
/slice        （之後的一切）    換真線、加功能、快改、斷點續跑
```

給非工程背景的使用者：AI 一次問一題、給選項帶推薦、「不知道」永遠是合法答案、
先拿到整個可點原型再逐片接真後端、斷線重開能接著走。

## 安裝

```bash
claude plugin marketplace add beastgummy0321-stack/skeleton-slice-pencil
claude plugin install skeleton-slice-pencil@skeleton-slice-pencil
```

裝完重開 session，跑 `/setup-workflow` 裝外部依賴（會先列清單問你）。

## 內容

| 部件 | 作用 |
|---|---|
| `skills/skeleton/` | 初始化：訪談樹（grilling 引擎＋白話契約）→ 靜默地基 → 全站原型平行生成。新專案建置或舊專案接管（只加不改）皆用 |
| `skills/slice/` | 日常入口：分流（快改／三站切片：補問凍結→做後端→換真線＋拔根測試）、斷點續跑 |
| `skills/container-contract/` | 集裝箱憲章觸發器 |
| `skills/setup-workflow/` | 外部依賴安裝精靈 |
| `rules/` | 規範本體（英文，注入 113 行）：workflow（分工＋交件閘＋退件上限）、reuse-first、container-contract（模組邊界）、screen-contract（畫面契約） |
| `hooks/session-rules.mjs` | SessionStart 把 workflow／reuse-first 注入每個 session |
| `hooks/load-budget.mjs` | PostToolUse 規範檔閘門：CLAUDE.md／AGENTS.md 及 @ 引用檔合計 500 行上限 |
| `hooks/adr-index.mjs` | 雙模式。PostToolUse 閘門：`docs/adr/` 下的 ADR 必須帶 `id`／`decision`（裁決本身，一句、≤120 字）／`applies-to`／`status` 前置資料；ADR 內文長度不限。CLI：`node hooks/adr-index.mjs <path…>` 即時算出該路徑適用的 ADR 索引行（沒有索引檔，不會漂） |

## 外部依賴（/setup-workflow 代裝，先問過你）

- [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)：最小實作紀律
- [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd)：輸出格式紀律
- [mattpocock/skills](https://github.com/mattpocock/skills)（官方 marketplace `mattpocock-skills`）：grilling、to-tickets、tdd、domain-modeling、wizard、research、to-questionnaire

選配（有裝就用，沒裝跳過）：[leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill)、[pbakaus/impeccable](https://github.com/pbakaus/impeccable)、
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)：前端生成與打磨、
[kevintsai1202/Humanizer-zh-TW](https://github.com/kevintsai1202/Humanizer-zh-TW)：繁中文案去 AI 味（非 plugin，手動裝到 `~/.claude/skills/`）。
四者合稱 Frontend Pack，安裝與降級規則見 `/setup-workflow`。

## 已有全域規範的機器注意

`~/.claude/CLAUDE.md` 已 @ 匯入 workflow.md／reuse-first.md 者，
與本 plugin 的 SessionStart 注入重複——二選一，移除 @ 匯入行或不啟用本 plugin hook。

## 流程一頁圖

```
/skeleton（每專案一次）
  訪談樹：給誰用→最常做什麼→功能逐項要不要（附「不知道」出口）
  Gate A：憲法（≤20 行）＋模組圖（含判讀歸屬）＋借鑑清單＋stack 按最終商業形態定 → 使用者簽字
  地基：stack＋模組軌道＋depcruise 證紅＋冒煙證紅（靜默，安裝先點頭）
  原型：風格錨 1 頁挑 1 版 → 每頁一個 subagent 平行生成 → 全站可點、四態可切
  交付：BOARD.md 寫滿 [ ]，逐片等 /slice 換真線。原型階段加刪功能免費。

/slice（之後的一切）
  分流：A 樣式直改｜B 快改｜C 三站｜新畫面先補原型頁｜多畫面拆片
  三站：①補問凍結（清 UNKNOWN→schema 凍結）→ ②做後端（TDD＋獨立驗收）
        → ③換真線（前端零 diff＋拔根測試）
  收工：看板刪行、git 當檔案館、過程檔即刪
```


---

## Pencil 相關內容已移除（v4.7.0）

`rules/pencil-bridge.md`、`bin/pencil-preflight.ps1`、`bin/pen-verify.mjs` 與 `/skeleton` 的
Pencil 路線都已刪除：那是為單一設計工具寫的規範，只服務一種場景。要回頭看用 `git log`。
plugin 名字暫時保留 `skeleton-slice-pencil`——改名會逼所有安裝過的人重裝，不值得。

`skills/skeleton/SKILL.md` 第 4 節有原型天花板、原型模式三選一、文案分桶；
`skills/slice/SKILL.md` 第 2 節分流表含「新畫面或新狀態」；`skills/setup-workflow/SKILL.md` 有 Frontend Pack；
`rules/screen-contract.md` 第二節有風格錨與 tracer 例外。
