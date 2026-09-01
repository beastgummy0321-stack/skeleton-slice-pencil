---
name: slice
description: 做下一片——初始化之後的一切開發入口：換真線、新功能、改東西、修畫面、繼續上次沒做完的。自動分流（快改／三站切片）、斷點續跑、完成即刪看板行。觸發：slice、下一片、繼續、我想加、我想改、新功能、新頁面。
---

# /slice

前置：專案已跑過 /skeleton（有 BOARD.md＋畫面契約＋可點原型）。沒有 → 先帶使用者跑 /skeleton。

## 0. 溝通契約（對使用者的每一句話都適用）

1. 一次一題；AskUserQuestion，2–4 選項＋每項一句白話＋標「(推薦)」。
   使用者說「一輪多題」或專案 CLAUDE.md 註明節奏＝多題 → 一輪拋完 frontier，編號＋各附推薦。
2. 禁術語；非用不可附一句比喻。時間講具體（「約一杯咖啡的時間」）。
3. 每站開場報位置：「第 N 站，共 3 站」。
4. 不可逆先講後果再問。出錯只說「發生什麼＋我怎麼修」，不貼 log。
5. 本檔其餘部分是內部作業指令，照術語走，不外洩給使用者。
6. 完工回報＝驗工單：逐步列「開哪個畫面、按什麼、看到什麼算過」，開畫面的步驟附小幫手走過的 ✅ 與截圖路徑；
   檔案清單／endpoint 等術語交付清單不得作為回報主體。
   但**必須附一行白話體積**：「這片加了 X 行程式、Y 行測試，這個模組現在共 Z 行」——
   行數不是術語，藏起來就沒人看得見膨脹。

## 1. 開場

讀 BOARD.md。

- 有 `[>]` → 報站（「上次走到第②站，繼續嗎？」）→ 從卡點續跑。
- 無 `[>]` 且使用者有新願望 → 第 2 節分流。
- 無 `[>]` 且無願望 → 念 `[ ]` 清單問挑哪片。

## 2. 入口分流（agent 讀 code 後自行判定，不問使用者技術題）

| 判定 | 條件 | 路線 |
|---|---|---|
| A | 只動樣式／文案／間距 | 直接改 → lint → 驗工單先走一遍（workflow.md Gate）→ 完工回報。動到「讀的字」照 /skeleton 第 4 節第 6 點過 humanizer。不進看板 |
| B | Behaviour change; schema, module entry points, money and permission paths all untouched. **Default route.** | Confirm expected behaviour → edit → any branch/loop/money path gets one runnable check → machine gate (workflow.md Gate) → four-state spot check **only if UI changed** → acceptance-step walk (workflow.md Gate) → report. Not on board |
| C | 只有這四類（加換真線）：schema／migration、模組邊界、金流、權限／租戶隔離 | 開片（或認領既有 `[ ]` 行）→ 三站 |
| New screen or state | Page or user-visible state absent from the prototype **and needing new data** (schema field or action; screen-contract.md scope). No new data → route B | 先照 /skeleton 第 4 節同風格錨生成假資料版（含該節「原型天花板」）＋看板加行，再走 C |
| 大 | 願望涉及 >1 畫面或預估 >1 票 | 全切後打：願望超出現行憲法或模組圖 → 先回 **Gate A**（workflow.md）修憲；否則先過 workflow.md「Premise check」一題 → /to-spec 出規格書 → **Plan review**（workflow.md：沒看過對話的 Opus 審規格書，產出是給使用者看的備註，不是否決）→ /to-tickets 垂直切完全部票 → 使用者點頭 → 照 workflow.md Tickets **循序**派 Sonnet 實作（平行只在兩票無共用檔且各超過半天時）→ 使用者可選 grill 下一個功能區塊或等這片，重疊是選項不是義務 |

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
使用者自己也答不出 → /to-questionnaire 生問卷讓他拿去問懂的人，本片暫停或換片。
外部平台欄位（Meta／Google Ads 等）用 /research 查官方文件填入＋註明出處；查無 → 停下問，禁自創。
不可逆決定（資料模型／邊界／同步異步／錯誤邊界）→ /domain-modeling 記一頁。
UNKNOWN 收錄門檻（防規劃無限延長）：只收不可逆表命中、或使用者看得到的行為差異；
線外細節不列 UNKNOWN，實作時 agent 自決＋標 `ponytail:` 註解。
每題過四格路由（同 /skeleton 溝通契約）：使用者不確定 → 先探路
（agent 讀 code＋查同類產品 → 2–4 選項＋取捨＋推薦）再問，禁追問第三次。
關卡：UNKNOWN 清空 →（有動 schema 才凍結＋commit `slice-NN: schema frozen`）→ 開票 `docs/issues/<slug>/ticket.md`，三欄照 workflow.md「Spec before dispatch」；答不出的欄位升級，不得填空。

### ② 做後端

**後端天花板**（對稱於 /skeleton 第 4 節的原型天花板）：
凍結 schema 沒有的欄位不寫；票沒要求的分支不寫；沒有 done-check 指名的測試不寫；
「之後可能會用到」的抽象一律不寫。**done-checks 全綠即停，禁再打磨。**

照凍結 schema 實作真 handler（派 Sonnet）。
派實作 subagent 時附：凍結 schema 原文＋本 plugin 的 `rules/container-contract.md`（本 SKILL.md 上兩層的 rules 目錄） 原文（不摘要、不重寫）。
金流／解析／複雜分支 → /tdd。
交件閘＝機器組：type check＋depcruise＋受影響測試＋build 全綠才准進審查（workflow.md Gate）；對話台在驗收前跑一次，不得省略。
**同一張票撞紅兩次仍不綠 → 停止重試**，回報「卡在哪一條 done-check」，由使用者決定改票還是改做法。禁第三次自動重跑。
派工後告知使用者現在在跑什麼，**不承諾時間**——沒有人能預測一個 agent 跑多久，開了就是空頭支票。
接著問他要開始下一片的①站補問、還是等這片。**重疊是選項，不是義務**：
實測強制重疊會讓多個 agent 卡在等不會來的通知，反而要主對話台自己接手收尾。
關卡：機器組全綠＋一輪 Sonnet 獨立審查（只對驗收清單與 container-contract；風格意見記備註、不退件；最多複審一次，爭議由主對話裁決）。

### ③ 換真線

移除該片假資料源。前端 diff 必須為零（有 diff＝違約，停下回報）。Playwright 冒煙過。
Pull-out test (container-contract §6), non-core modules only: remove the module folder + registration line → build passes, main screen loads → restore.
Fail = hidden coupling; fix until green. Core module → Playwright smoke + main screen loads instead.
驗工單先由小幫手走一遍（workflow.md Gate）→ 使用者再玩一次 → 點頭。
收工前問一題：**「這片你打算什麼時候真的拿它做一次事？」**
答案只作情報記錄（提醒使用者去用），不觸發任何封鎖或路由。

收工動作（一次做完）：BOARD.md 刪行｜commit `slice-NN done: <名>`｜
刪本片票與過程檔（`docs/issues/<slug>/`、UNKNOWN 清單、草稿）｜問「接著做下一片＜名＞嗎？」

### C-舊（切片碰到違規老 code 時的附加規則）

- 先拍照：characterization test 鎖住舊行為現狀（弄壞 → 紅 → 復原，證明測試有效）才准動手。
- 絞殺者模式：新 code 照軌道長在 `src/modules/` 內；舊 code 不整修、不擴建。
  呼叫端逐一改指向新進入點。
- 呼叫端歸零的舊 code 當片內刪除；歸不了零 → 列 BOARD.md 新 `[ ]` 行。
  就地擴建舊 code 一律禁止。
- 大爆炸重寫一律禁止；一片只遷一個畫面的份量。

## 4. Subagent 回報格式

結論＋檔路徑:行號＋跳過了什麼。複述整份檔案內容一律禁止。
