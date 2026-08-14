---
name: skeleton
description: 骨架日——每專案一次的地基安裝：技術棧、模組軌道、機器糾察隊、切片看板、專案記憶。新專案建置或舊專案接管（只加不改）皆用。觸發：骨架日、skeleton、初始化專案、建地基、新專案開工、接管舊專案。
---

# /skeleton 骨架日

每專案跑一次。產物全部常駐 repo；本 skill 跑完即退場。

## 0. 溝通契約（對使用者的每一句話都適用）

1. 一次一題；用 AskUserQuestion，2–4 選項＋每項一句白話＋標「(推薦)」。
2. 禁術語；非用不可附一句比喻。時間講具體（「約一杯咖啡的時間」）。
3. 每站開場報位置：「第 N 站，共 M 站」。
4. 不可逆先講後果再問。出錯只說「發生什麼＋我怎麼修」，不貼 log。
5. 本檔其餘部分是內部作業指令，照術語走，不外洩給使用者。

## 1. 判定新舊

repo 有既有原始碼（package.json 或 src 非空）→ 走第 4 節「舊專案」；否則走第 3 節「新專案」。

## 2. 引導題（≤5 題，一次一題）

新專案：專案名／要不要範例資料（有 → demo seed）／部署目標（本機先跑＝推薦）。
舊專案：主要痛點（改不動／看不懂／常壞）／哪個模組最先要動。
答案只用於本次配置，不落規範檔。

## 3. 新專案：建置

stack：Next.js+TS+Tailwind+shadcn/ui+tRPC+zod+Drizzle+SQLite 起步（後換 Postgres）
＋dependency-cruiser＋husky pre-commit＋Playwright。

1. 逐項查證現行版本與維護狀態（context7／官方 changelog，禁憑記憶）。
   結果列表：名稱｜版本｜最後更新｜授權。
2. 安裝清單＋磁碟影響 → 使用者點頭才執行。未點頭不得裝任何東西。
3. scaffold 後立刻打通 tracer：一個真畫面 → tRPC procedure → DB 一張表，
   瀏覽器 preview 給使用者看「會動的證明」。
4. 模組軌道：`src/modules/<名>/index.ts` 唯一進入點；
   depcruise 規則＝跨模組僅准 import 進入點＋禁循環依賴。
5. 證紅：故意寫一條跨界 import → depcruise 必須報錯 → 移除。
   不紅＝規則沒生效，修到會紅為止。
6. Playwright 冒煙 1 條（首頁載入）。同樣證紅（弄壞→紅→改回）。

## 4. 舊專案：只加不改

- 改動任何既有原始碼與結構一律禁止。違反＝本 skill 失敗。
- depcruise 掛基線模式：既有違規記入 baseline 檔，只擋新增的違規。
- 加：`src/schemas/` 目錄、BOARD.md、專案 CLAUDE.md、pre-commit（僅 lint 新改檔）。
- 盤點：派唯讀 subagent 掃模組結構（Grep 定位，禁整檔讀），產模組地圖——
  每模組一行：名字｜糾纏度（綠／黃／紅）｜危險區（金流／外部 API／共用狀態）。
  地圖只落兩處：BOARD.md 的 `[ ]` 行（照建議遷移順序排）＋專案 CLAUDE.md 地標節每模組一行。
  不另開地圖文件。
- 既有模組不補登記；碰到才照 /slice C-舊 規則逐片遷。

## 5. 常駐三件套

1. `BOARD.md`（repo 根）：

   ```
   # 切片看板（只放未開始＋進行中；完成即刪行，歷史＝git log）
   - [>] <編號> <名字> ｜ 目前站：①-⑤ ｜ 卡點一句話
   - [ ] <編號> <名字>
   ```

2. 專案 `CLAUDE.md`：抄 `assets/project-claude-template.md` 填空後寫入。
   專案已有 CLAUDE.md → 停下問使用者怎麼併，不得覆蓋。
3. 開場廣播：由專案 CLAUDE.md 第一節承擔（開 session 先讀 BOARD.md、有 [>] 主動報站）。
   ponytail: 純 CLAUDE.md 指令版；實測 agent 漏報再升級 SessionStart hook。

## 6. 尾站：領域盤點（新專案未做者，第一個 C 路線切片前必補）

問使用者：「要不要現在把『系統裡有哪些東西』聊清楚？約 2–3 小時，可分次。」
做法：/grilling 問法只問名詞（實體、關係、誰擁有誰）；
產出 `src/schemas/domain.ts` 骨架＋ /domain-modeling 一頁決策紀錄。
舊專案：先從 code 蒸餾草案，只問 UNKNOWN。

## 7. 收工檢核（全過才報完工）

tracer 會動｜depcruise 證過紅｜冒煙證過紅｜BOARD.md 在｜專案 CLAUDE.md 在｜安裝清單經點頭。
回報格式：三件套路徑＋證紅紀錄＋跳過了什麼。
