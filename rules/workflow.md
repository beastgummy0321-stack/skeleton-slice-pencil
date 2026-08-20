# 通用開發工作流規範

適用**所有專案**。凡與各專案內舊版 workflow.md 衝突以本檔為準。
分工原則：Claude 想與審，Codex 做。不讓高階模型處理低階、高頻、重複或工具密集型工作。

## 零、環境判定（可攜條款）

環境變數 `CODEX_EXEC_BIN` 有值，或 PATH 可解析到 `codex` 執行檔 → exec 條款全檔照辦。
兩者皆無 → 本檔所有 exec 條款停用，改為：
實作與探查派內建 subagent（Task／Agent 工具），審查由未參與實作的獨立 subagent 執行。
其餘條款（規格凍結、交件閘、耦合紀律、DoR）照舊，一條不減。
無 wrapper 時第五節機器組改由協調者在合併前手動跑一次 `verify` 指令，不得省略。
## 一、兩側分工（強制）

| 階段 | 由誰做 | 交出什麼 |
|---|---|---|
| 討論、發想、方案仲裁 | Claude | 定案結論 |
| 凍結規格 | Claude | 票：三欄 ＋ 可判定驗收清單 |
| 實作 | Codex Terra | 程式碼 ＋ 可執行自測 |
| 交件閘 | 機器組（wrapper 跑 verify） | 全綠才准進審查 |
| 交件後獨立審查 | Claude | 通過，或說明哪裡不對並重派 |

Claude 不寫實作程式碼。Codex 不改規格。任一方要跨線，停下回報使用者。
**唯一豁免＝slice 路線 A／B 快改**（純樣式／文案，或不動 schema 與模組進入點的行為修改）：
由對話 Claude 直接改，不開 run、不派工；一旦動到 schema 或模組進入點，
當場升級 C 路線，照本節分工。
上下文一律以檔案傳遞（票＋驗收清單）。

## 二、派工一律走 exec wrapper（強制）

唯一入口：

```bash
node scripts/dispatch.mjs --ticket <票號> --cwd <projectRoot> --role impl|review|scout
```

裸 `codex exec` 與裸 orca orchestration 指令一律禁止（閘門攔截）。

- worker＝子行程：完工＝退出碼＋last-message 檔；wrapper 由協調者以背景任務執行，
  完工通知由 harness 送達，不設輪詢、不設等待器
- 審查 role 寫不進 worktree：review 的可寫根（-C）＝reviews 目錄、scout＝reports 目錄；審查不得改碼，由機器強制
- 上下文一律以檔案傳遞：spec 只傳票檔與報告路徑，不夾帶規格內容
- 模型與檔位由 wrapper 固定（Terra／Sol＝high、Luna＝low），不得依賴 config.toml 全域值
- impl worker 退出後 wrapper 自動跑第五節機器組（`pipeline.json` 的 `verify`），結果落盤 `reports/<票號>-r<輪>-verify.txt` 並回傳 `verify_ok`

## 三、模型分工

### Claude 側（想與審）

- **Fable**：方向、系統邊界、不可逆決策、方案仲裁、多票優先序。
  不做 Repo 全面掃描、不讀原始長日誌、不寫程式碼、不進 fix／retry 迴圈。
- **Opus**：技術架構、跨模組整合、複雜 Root Cause。
  不可逆項目（改資料庫結構、金流、核心架構、公開 API 契約）的重派判定由 Opus 做。
- **Sonnet**：預設審查者。獨立驗證、規格文字化、技術文件。
  對同一問題連續兩輪無進展才升級 Opus；不因任務「重要」自動升級。
- **Haiku**：唯讀探查、檔案盤點、規則掃描、日誌摘要。不做最終驗收。

### Codex 側（做）

模型描述取自 Codex `models_cache.json`，不得憑記憶改寫。

- **gpt-5.6-sol**（frontier）：**只用於例外**——票面標記金流／解析／狀態機三類的審查、複雜 Root Cause。
  一般票由第五節機器組把關，不排 Sol。審查時不得改碼，一律退回 Terra 改。
- **gpt-5.6-terra**（balanced）：預設實作主力。
- **gpt-5.6-luna**（fast）：唯讀探查、檔案盤點、日誌摘要。不做審查、不做最終驗收。
## 四、規格凍結（Claude 端，Codex 開工前）

票面三欄，缺一即 DoR 未達成，Codex 不得開工，Claude 不得審查：

1. **要什麼**：API 契約附 JSON 字面範例；使用者可見字串附格式範例字面（一句範例，非文字描述）；
   每個資料點寫明「落盤」或「即時算」
2. **怎麼算過**：可判定驗收清單，每條須能用「跑起來看得到」或「測試會紅」判定
3. **會碰哪些共用檔**：`shared_files` 清單（第六節四護欄依據）；帶 migration 時標明

不可逆決定（資料模型／邊界／同步異步／錯誤邊界）在 `/slice` ①站補問凍結時處理，
用 `domain-modeling` skill 記一則決策紀錄（決定／理由／當時排除了什麼），不重複進票面。
欄位不適用者寫「N/A＋原因一句」即為達成；審查不得以 N/A 欄位判 DoR 未達成。

金流／解析／狀態機接縫照票面預定接縫走 TDD。開發中只跑型別檢查＋受影響單檔測試；
完整套件由第五節機器組在交件時跑一次。
worker 自行宣告審查通過或自行合併主幹一律禁止，審查與合併歸協調者。

## 五、交件與重派（強制）

### 機器組＝交件閘

impl worker 退出後，wrapper 立即在該票 worktree 執行 `pipeline.json` 的 `verify` 指令
（型別檢查＋邊界檢查＋受影響測試＋build，30 秒～2 分鐘級）。
輸出落盤 `reports/<票號>-r<輪>-verify.txt`，結果寫入 exit 紀錄的 `verify_ok`。

- 機器組紅燈＝未交件：協調者以 `--redispatch` 把 verify 輸出退回 worker，不排審查、不算一輪
- `verify` 欄缺漏時 wrapper 跳過並回傳 `verify_ok: null`；跳過即視同未驗，審查者不得引用為通過依據
- worker 的文字宣稱一律不得作為通過依據；一律以機器組輸出與 `git diff` 為準
- 審查一律不重跑完整套件；引用機器組輸出並註明是引用

### 獨立審查（Claude 側）

機器組全綠後，由未參與實作的 Claude 審查者看 diff 對驗收清單。
通過即合併；不通過即說明哪裡不對、重派。
退件序號、退件分類（impl／spec）、退件單格式一律不設——說哪裡不對即可。

### Sol 只在例外上場

預設不排 Sol。只有票面標記 `金流｜解析｜狀態機` 三類之一的票，才在機器組全綠後加排一次 Sol。
其餘票型一律機器組全綠後直接進獨立審查。

### 三次停止（機器強制）

同一票 impl 重派累計三次即停票、不得再派工，交使用者裁決並附：
三次各自原因、一句話結論（卡點是規格沒定死或實作沒做到）。
本條由派工閘以 `status=rejected 且 round>=3` 強制。

### 複驗範圍

第二輪起只驗上一輪列出的問題項＋一項「本輪新破壞」檢查；首輪已判過的驗收條目不得重驗、不得重讀那些檔。

### 飄動測試

測試紅燈先單獨重跑該檔；單獨跑會過即為飄動，本輪不得據此重派，紀錄測試名稱與兩次結果。
同一飄動測試兩輪內出現第二次，當場開隔離票排進看板最前。

## 六、常設編制（中小票免逐張提計畫）

經此規範授權後直接開工、不需逐張請示：
Claude 凍結規格 → Codex Terra 實作 → 機器組交件閘（wrapper 自動跑）→ Claude Sonnet 獨立審查
→ 涉及 UI 時加瀏覽器實測驗收（各專案自訂視口標準）→ 需要時 Luna／Haiku 唯讀探查先行。

**仍需使用者批准才動工的例外**：改資料庫結構（migrations）、碰金流／付費 API 簽約、
對外發布／公開內容、不可逆操作（刪除真實資料等）、改核心架構、需求矛盾、
或預估屬大型工程（跨多模組重構）——這些先提計畫等批准。

先後依賴的多張票經**一次批准**即可連續執行，完成後一併回報，中間不停。

### 完工回報＝驗工單（強制）

- 對使用者的完工回報一律交「驗工單」：逐步列使用者親手可做的驗收動作
  （開哪個畫面、按什麼、看到什麼算過），每步一句白話
- 檔案清單、endpoint、commit 摘要、測試數字等技術交付清單不得作為完工回報主體；
  技術細節寫進票檔與 git log，使用者要看再給

### 流水線（強制）

- 派第一張票前先跑環境煙霧組（30 秒級）：依賴套件裝齊（有 manifest 即以 manifest 驗）、
  測試可收集、前端可建置；任一紅燈未清不得派工
- 前一批進入實作，協調者即凍下一批票；前一批進入驗收，下一批立即派工——
  實作 worker 不得閒置等驗收結果
- 畫面契約凍結後，前端票與後端票雙工人並行；同時開第二實作工人一律 worktree 隔離，
  不得兩個實作工人共用同一工作區
- 每批過獨立驗收後立即 commit；前批未 commit 前，下一批不得修改與前批重疊的檔案
- 免 migration、不碰金流、純黏合的批次，做後端與換真線可合併一票交付；機器組與獨立審查不得因此省略
- 完工通知到達即安排審查；worker 為子行程，交件即退出，無閒置 worker
- 主幹紅燈或合併衝突 → 協調者開 hotfix 票（檔名含 hotfix），寫入 pipeline.json 佇列最前、
  blocked_by 空，經 wrapper 派工修復；hotfix 在飛期間其他線不得合併

### 多模組平行施工四護欄（強制）

- 開票時列「本票會碰的共用檔清單」；兩張在飛的票共用檔重疊即不得同時派工
- 帶 migration 的票同時最多一張在飛；migration 序號由協調者發放，worker 不得自取
- 平行線合併回主幹後，主幹立即重跑機器閘門快測組＋完整套件一次；紅燈未清不得進行下一次合併
- 只平行依賴圖上無交集的票（看板排序＝依賴序）；有依賴的票不得為平行度硬拆

## 七、切票紀律：垂直切、全切後打（強制）

- 預估超過一張票的工程，先 `/to-spec` 出規格書、再 `/to-tickets` 把票**全部切完**
  才准派第一張；邊實作邊切票一律禁止
- 票一律垂直切：一張票打穿它所需的全部層（schema→API→畫面→測試），完成即可單獨展示。
  按技術層橫切的批次（純後端批、純前端批）一律禁止；唯一例外＝to-tickets 定義的
  wide refactor，照擴張—收縮（expand–contract）切
- 單票量上限＝一個新鮮上下文吃得完；含狀態機、確認流程、預設值哨兵語意的邏輯
  單獨成票，不得與一般增查改端點併票
- 每張票必標「被誰擋」（blocking edges）；缺此欄即 DoR 未達成
- 票單切完先給使用者過目（粒度＋依賴邊），點頭後凍結；凍結後改票單＝回 to-tickets 重切
- 多線並行＝常態預設，不需逐次請示：票單凍結後，凡依賴圖無交集且通過四護欄的票
  一律同時開線，每線獨立 worktree（集裝箱），完成並過審後就地候合併；
  合併秩序照第六節合併門（一次一線、紅燈未清不合下一線），候合併線等待期間不得追加改動
- 不開多線僅限三種情況：在飛票只剩一張、共用檔重疊排不開、機器資源不足；
  串行時票面寫明原因一句，缺原因即視為違反本節
- 調度走前線（frontier）：所有無阻擋票同時派工，受第六節四護欄約束；
  有依賴的票不得為平行度硬拆
- 垂直票含前後端時，票面附畫面契約，票內施工順序照 screen-contract（先後端後前端）；
  票單凍結時逐票核對「票內每個前端互動都有對應端點」，缺端點的票不得標 ready
- 任務本質不適合多 Agent 就直說，改用單一 agent 完成，不勉強建工作流

## 八、定案的耦合紀律（討論／凍結規格／開票一律適用）

- 每條定案必附兩行：**重用哪段既有程式**、**與其他定案之間的依賴邊**；缺任一即為未定案
- 比較方案時，需同時改動兩個以上模組才能上線的選項不得列為建議方案；
  拆不開時逐項寫明原因，並切成可獨立驗收的票
- 同一能力禁止依情境分岔成兩條代碼路徑；差異一律放進宣告式的規格表／參數，代碼路徑只有一條
- **雙向依賴禁止**：A 認識 B，B 就不得認識 A。含透過事件、callback、共用可變狀態
  互相呼叫。發現既有雙向依賴 → 停下回報，不得自行改依賴方向
- 新模組定案時寫出兩行：**對外進入點是哪一個**、**誰依賴它**；缺任一即為邊界未定，不得開工

## 九、派 agent 的安全規則

Codex worker 一律讀專案 AGENTS.md 的 `skeleton-slice:rules` 內嵌區塊；prompt 只傳票檔與報告路徑，
不得夾帶 code-rules 原文。內建 subagent 仍傳「六、Subagent 專用」與「三、禁止」原文。

### worktree 基準（強制）

- 開平行線 worktree 後第一個動作＝驗證基準 commit 是目標分支 HEAD（`git log -1`＋
  `git rev-list --count HEAD..<目標分支>` 必須為 0）；不是即先合流再開工，不得在過時基準上實作

## 十、單台調度（多線並行時強制）

多線並行啟用時（`.scratch/<effort>/pipeline.json` 存在且 `mode="dual"`），對話台即協調者：
grill、凍票、派工（背景任務）、收完工通知、安排審查、合併全在同一台執行；
使用者只回答 grill 與點頭，不做任何操作。

- 派工一律以背景任務執行 wrapper，送出後立即引導使用者 grill 下一個功能區塊，不得讓使用者乾等。
- escalation 機制：worker 把需裁決事項寫入 `.scratch/<effort>/escalations.md` 並以非零退出碼收工；
  協調者每個回合開頭讀 escalations.md，不限 grill 段落結束，有項目即先帶使用者裁決。

### pipeline.json（機器閘門依據，/to-tickets 收尾時產出）

```json
{"mode":"dual","approved":false,"verify":"npm run verify","tickets":[{"id":"01",
 "file":"issues/01-x.md","branch":"line-01","status":"pending","shared_files":[],"migration":null}]}
```

- status 取值：pending｜dispatched｜approved｜merging｜merged｜stopped｜rejected
- approved 由使用者點頭後改 true；false 時派工閘擋下全部派工
- `verify`（頂層）＝第五節機器組指令，在票的 worktree 執行。缺此欄 wrapper 跳過機器組並回傳 `verify_ok: null`
- 必填票欄＝id｜file｜branch｜status｜shared_files｜migration。`blocked_by` 選填：
  看板排序即依賴序，只有真的要機器擋順序時才填
- 檔名含 review 的審查票不入 pipeline.json、不受派工閘管
- 派工指令的 spec 必須引用票檔路徑（`.scratch/<effort>/issues/*.md`），否則派工閘擋下

## 十一、上下文預算

- 派工只准執行 `node scripts/dispatch.mjs`。
- pipeline.json 必須落盤票的 status 與 round，收工必須落盤 exit 與 history（每筆含 role、round、code、timed_out、duration_s、last_message、verify_ok）；訊息全文必須落盤 reports/。
- 票檔不得超過 150 行；超限票必須回 /to-tickets 重切。
- last-message 本文必須恰為兩行：結論一行與報告檔路徑一行。
- AGENTS.md 的 skeleton-slice 內嵌區塊必須等於 code-rules 第三節、第六節與 container-contract.md；漂移即不得交件。
