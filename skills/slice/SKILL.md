---
name: slice
description: 做下一片——初始化之後的一切開發入口：換真線、新功能、改東西、修畫面、繼續上次沒做完的。自動分流（快改／三站切片）、斷點續跑、完成即刪看板行。觸發：slice、下一片、繼續、我想加、我想改、新功能、新頁面。
---

# /slice

前置：專案已跑過 /skeleton（有 BOARD.md＋畫面契約＋可點原型）。沒有 → 先帶使用者跑 /skeleton。

## 0. 溝通契約

照 /skeleton 第 0 節（一次一題＋選項＋推薦、禁術語、四格路由、不可逆先講後果）；本 skill 報位置為「第 N 站，共 3 站」。
完工回報＝驗工單：逐步列「開哪個畫面、按什麼、看到什麼算過」，開畫面的步驟附小幫手走過的 ✅ 與截圖路徑；
檔案清單／endpoint 等術語交付清單不得作為回報主體。
**必附一行白話體積**：「這片加了 X 行程式、Y 行測試，這個模組現在共 Z 行；`routes.py` 已到警戒線的 96%」（超過專案行數上限八成的檔要點名）。

## 1. 開場

讀 BOARD.md。

- 有 `[>]` → 先 `git status --short`：工作樹有未 commit 的改動＝上一個 session 的半成品，報站時一併白話講出來，問「留著給新的小幫手接手，還是丟掉重做」（預設：`git stash push -m <片名>` 收起來，新實作者從乾淨的樹開始——半成品也是壞掉的上下文的一種）。決定後才報站（「上次走到第②站，繼續嗎？」）→ 從卡點續跑。
- 無 `[>]` 且使用者有新願望 → 第 2 節分流。
- 無 `[>]` 且無願望 → 念看板的目標行，挑定目標後念該資料夾的 `NN-*.md`／`issue-*.md` 問挑哪片。

## 2. 入口分流（agent 讀 code 後自行判定，不問使用者技術題）

| 判定 | 條件 | 路線 |
|---|---|---|
| A | 只動樣式／文案／間距 | 直接改 → lint → 完工回報（**不派小幫手走瀏覽器**：確認一個字改了比讀那個字還貴，使用者自己看一眼就夠）。動到「讀的字」照 /skeleton 第 4 節第 5 點過 humanizer。不進看板 |
| B | Behaviour change; schema, module entry points, money and permission paths all untouched. **Default route.** | Confirm expected behaviour → edit → any branch/loop/money path gets one runnable check → machine gate (workflow.md Gate) → four-state spot check **only if UI changed** → acceptance-step walk (workflow.md Gate) → report. Not on board |
| C | 只有這四類（加換真線）：schema／migration、模組邊界、金流、權限／租戶隔離 | 開片（或認領既有 `[ ]` 行）→ 三站 |
| New screen or state | Page or user-visible state absent from the prototype **and needing new data** (schema field or action; screen-contract.md scope). No new data → route B | 先照 /skeleton 第 4 節同風格錨生成假資料版（含該節「原型天花板」）＋目標資料夾加 `issue-<畫面>.md`，再走 C |
| 大 | 願望涉及 >1 畫面或預估 >1 票 | 願望超出現行憲法或模組圖 → 先回 **Gate A**（workflow.md）修憲；否則照 workflow.md「Tickets and parallel work」第一條：Premise check → 對話台寫 `docs/issues/<目標>/spec.md` → **Plan review** → 對話台切成四欄票 → 使用者點頭 → **循序**派 Sonnet 實作 |

**判定順序：A → B → C。** 砍願望的關卡在 workflow.md 的 Premise check 與 Gate A，不在分流表——
分流表只決定怎麼做，不決定該不該做。
B 路線中途發現要動 schema、模組邊界、金流或權限 → 當場升級 C，告知使用者。
Record the route: first line of the A/B completion report and the C `slice-NN` commit message carry `route=<A|B|C>: <one-line reason>`.

## 3. 三站（C 路線）

每站過關「當下」更新 BOARD.md 站別欄，不得累積到收工才寫。
凍結物中途發現做不到 → 停下回報；改契約的決定屬使用者，不屬 AI。

### ① 補問凍結

本站第一題＝workflow.md「Premise check」，格式與選項照那一節，這裡不重述。挑定才清 UNKNOWN。
清空本片 UNKNOWN（/skeleton 推遲下來的業務題）：/grilling 引擎、
溝通契約覆蓋（一次一題＋選項＋推薦），只問 agent 無權替使用者決定的業務題。
使用者自己也答不出 → 列成問題清單讓他拿去問懂的人，本片暫停或換片。
外部平台欄位（Meta／Google Ads 等）用 /research 查官方文件填入＋註明出處；查無 → 停下問，禁自創。
不可逆決定（資料模型／邊界／同步異步／錯誤邊界）→ /domain-modeling 記一頁。
UNKNOWN 收錄門檻（防規劃無限延長）：只收不可逆表命中、或使用者看得到的行為差異；
線外細節不列 UNKNOWN，實作時 agent 自決＋標 `ponytail:` 註解。
每題過四格路由（/skeleton 第 0 節）：使用者不確定 → 先探路再問，禁追問第三次。
關卡：UNKNOWN 清空 →（有動 schema 才凍結＋commit `slice-NN: schema frozen`）→ **全名掃描** → 開票 `docs/issues/<目標>/NN-<名>.md`（既有 `issue-<名>.md` 升票＝改名後填四欄），四欄照 workflow.md「Spec before dispatch」；答不出的欄位升級，不得填空。
**開票前一步是掃描，不是回想。** 這片會「不再存在或改變意思」的每一個名字——表、欄位、函式、檔名、常數——各跑一次**不限目錄、不限副檔名**的全 repo 搜尋，命中清單原樣貼成 `## Shared files touched`。掃**會變的那個名字**，不是它所屬的東西。

### ② 做後端

**後端天花板**（對稱於 /skeleton 第 4 節的原型天花板）：
凍結 schema 沒有的欄位不寫；票沒要求的分支不寫；沒有 done-check 指名的測試不寫；
「之後可能會用到」的抽象一律不寫。**done-checks 全綠即停，禁再打磨。**

照凍結 schema 實作真 handler（派 Sonnet）。派工 prompt 內容照 workflow.md「Spec before dispatch」最後一段
（票路徑＋`rules/agent-brief.md`＋`rules/container-contract.md` 原文＋票指名的契約頁＋ADR 索引行；不摘要、不重寫）。
`agent-brief.md` 不能省：子 agent 從來沒讀過 workflow.md，它被審的規則只有跟著派工單走才會到它手上。
金流／解析／複雜分支 → /tdd。
交件閘、紅了怎麼辦、第二次紅換工作種類、三種判決與各自去向，全照 workflow.md「Gate and review」，這裡不重述（重述會漂移）。
派工後告知使用者現在在跑什麼，**不承諾時間**；問他要開始下一片的①站補問、還是等這片——重疊是選項，不是義務。
關卡：機器組全綠＋一輪 Sonnet 獨立審查（審查也附 `rules/agent-brief.md` 原文）判 `ship`。

### ③ 換真線

移除該片假資料源。前端 diff 必須為零（有 diff＝違約，停下回報）。Playwright 冒煙過。
Pull-out test (container-contract §6), non-core modules only: remove the module folder + registration line → build passes, main screen loads → restore.
Fail = hidden coupling; fix until green. Core module → Playwright smoke + main screen loads instead.
驗工單先由小幫手走一遍（workflow.md Gate）→ 使用者再玩一次 → 點頭。

收工動作（一次做完）：刪票檔與過程檔（UNKNOWN 清單、草稿）｜目標資料夾裡沒有票也沒有 issue 了才刪看板行｜
commit `slice-NN done: <名>`｜做票途中發現而這張票沒修的事，各寫一份 `docs/issues/<目標>/issue-<名>.md`（成因／影響／`file:line`／`Status:`），看板不動｜問「接著做下一片＜名＞嗎？」

### C-舊（切片碰到違規老 code 時的附加規則）

- 先拍照：characterization test 鎖住舊行為現狀（弄壞 → 紅 → 復原，證明測試有效）才准動手。
- 絞殺者模式：新 code 照軌道長在 `src/modules/` 內；舊 code 不整修、不擴建。
  呼叫端逐一改指向新進入點。
- 呼叫端歸零的舊 code 當片內刪除；歸不了零 → 寫 `docs/issues/<目標>/issue-<名>.md`，看板不動。
  就地擴建舊 code 一律禁止。
- 大爆炸重寫一律禁止；一片只遷一個畫面的份量。
