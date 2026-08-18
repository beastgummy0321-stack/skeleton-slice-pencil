# 通用開發工作流規範

適用**所有專案**。凡與各專案內舊版 workflow.md 衝突以本檔為準。
分工原則：Claude 想與審，Codex 做。不讓高階模型處理低階、高頻、重複或工具密集型工作。

## 零、環境判定（可攜條款）

開工前跑一次 `orca status --json`。Orca 與 Codex 齊備 → 全檔照辦。
`orca` 指令查無、或本機無 Codex → 本檔所有 Orca／Codex 條款停用，改為：
實作與探查派內建 subagent（Task／Agent 工具），審查由未參與實作的獨立 subagent 執行。
其餘條款（規格凍結、退件制度、耦合紀律、DoR）照舊，一條不減。

## 一、兩側分工（強制）

| 階段 | 由誰做 | 交出什麼 |
|---|---|---|
| 討論、發想、方案仲裁 | Claude | 定案結論 |
| 凍結規格 | Claude | 票：DoR 五答 ＋ 可判定驗收清單 |
| 實作 | Codex Terra | 程式碼 ＋ 可執行自測 |
| 交件前內部審查 | Codex Sol | 內部退改（不計入退件數） |
| 交件後獨立審查 | Claude | 通過，或退件（附分類） |

Claude 不寫實作程式碼。Codex 不改規格。任一方要跨線，停下回報使用者。
上下文一律以檔案傳遞（票＋驗收清單）；Orca 訊息只傳「去讀哪一個檔」，不得夾帶規格內容。

## 二、交接一律走 Orca（強制）

Claude 與 Codex 之間不得直接呼叫對方 CLI、不得自行開 PTY、不得用裸 git worktree。
派工前先讀 `orca skills get orchestration`，指令與旗標不得憑記憶生成。標準路徑：

```bash
orca orchestration run-create   --objective "<本輪目標>" --json
orca orchestration task-create  --spec "<票：規格＋驗收清單>" --json
orca orchestration worker-start --task <task_id> --worktree current \
     --agent codex --model gpt-5.6-terra --effort high --json
orca orchestration check --wait --types worker_done,escalation,question \
     --timeout-ms 600000 --json
```

- `worker-start` 一律明寫 `--model`，不得依賴 Codex 端 `config.toml` 的預設值
- 實作派 `gpt-5.6-terra`、審查派 `gpt-5.6-sol`、探查派 `gpt-5.6-luna`
- 宣告「已派工」前先驗：`orca orchestration dispatch-show --task <task_id> --json`
- 沒有 task／dispatch 紀錄的工作，不得事後描述為已 orchestrated
- Orca 內建「同一 task 連續三次 dispatch 失敗即熔斷」與第五節退件三次是兩套計數，分開記
- `check --wait` 逾時或 `{count:0}` 視為檢查點，不得據此判定 worker 失敗或關掉 worker
## 三、模型分工

### Claude 側（想與審）

- **Fable**：方向、系統邊界、不可逆決策、方案仲裁、多票優先序。
  不做 Repo 全面掃描、不讀原始長日誌、不寫程式碼、不進 fix／retry 迴圈。
- **Opus**：技術架構、跨模組整合、複雜 Root Cause。
  不可逆項目（改資料庫結構、金流、核心架構、公開 API 契約）的退件判定由 Opus 做。
- **Sonnet**：預設審查者。獨立驗證、規格文字化、技術文件。
  對同一問題連續兩輪無進展才升級 Opus；不因任務「重要」自動升級。
- **Haiku**：唯讀探查、檔案盤點、規則掃描、日誌摘要。不做最終驗收。

### Codex 側（做）

模型描述取自 Codex `models_cache.json`，不得憑記憶改寫。

- **gpt-5.6-sol**（frontier）：交件前第一階段審查、複雜 Root Cause。
  審查時不得改碼，一律退回 Terra 改。
- **gpt-5.6-terra**（balanced）：預設實作主力。
- **gpt-5.6-luna**（fast）：唯讀探查、檔案盤點、日誌摘要。不做審查、不做最終驗收。

## 四、規格凍結（Claude 端，Codex 開工前）

凍結規格時逐項答完 `<plugin>/rules/code-rules.md`「不可逆決定」表的五個項目，
禁止以「先跑通再說」「之後再重構」代替答案。

同時產出**驗收清單**：每條須能用「跑起來看得到」或「測試會紅」判定。
缺五答或缺驗收清單即為 DoR 未達成，Codex 不得開工，Claude 不得審查。
本節定案內容用 `domain-modeling` skill 記成一則決策紀錄（決定／理由／當時排除了什麼）。

## 五、退件制度（強制）

### 計數口徑

只有「Codex 交件 → Claude 退回」算一次。Codex 內部 Sol 審查的來回不計數。

### 分類（退件時必填，二選一）

- `impl`：規格清楚、實作沒照做 → 計數 ＋1，退回 Codex 改
- `spec`：規格本身有洞、Codex 照做但方向錯 → **不計數**，中止本票、回第四節重凍規格、計數歸零

第二次退件時 Claude 必須明確宣告本票卡點屬 `impl` 或 `spec`，不得拖到第三次。

### 退件紀錄

由退件方（Claude）寫，實作方不得修改。放專案指定的 issue 目錄；
專案未指定時放 `.scratch/reviews/<票號>.md`。每次退件寫入：
退件序號、分類、引用的驗收條目、Codex 這次改了什麼。

### 三次停止

同一票 `impl` 退件累計三次，停止本票、不得再派工，並在紀錄結尾補一段交給使用者：
三次原因、Claude 判定依據、一句話結論（卡點是規格沒定死或實作沒做到）。

## 六、常設編制（中小票免逐張提計畫）

經此規範授權後直接開工、不需逐張請示：
Claude 凍結規格 → Codex Terra 實作（Sol 交件前審）→ Claude Sonnet 獨立審查
→ 涉及 UI 時加瀏覽器實測驗收（各專案自訂視口標準）→ 需要時 Luna／Haiku 唯讀探查先行。

**仍需使用者批准才動工的例外**：改資料庫結構（migrations）、碰金流／付費 API 簽約、
對外發布／公開內容、不可逆操作（刪除真實資料等）、改核心架構、需求矛盾、
或預估屬大型工程（跨多模組重構）——這些先提計畫等批准。

先後依賴的多張票經**一次批准**即可連續執行，完成後一併回報，中間不停。

## 七、工作切分原則

只依真正獨立的責任範圍切分（前端、後端、資料層、測試、特定模組）；
不得為了平行度硬拆有前後依賴的工作。任務本質不適合多 Agent 就直說，
改用單一 agent 完成，不勉強建工作流。

## 八、定案的耦合紀律（討論／凍結規格／開票一律適用）

- 每條定案必附兩行：**重用哪段既有程式**、**與其他定案之間的依賴邊**；缺任一即為未定案
- 比較方案時，需同時改動兩個以上模組才能上線的選項不得列為建議方案；
  拆不開時逐項寫明原因，並切成可獨立驗收的票
- 同一能力禁止依情境分岔成兩條代碼路徑；差異一律放進宣告式的規格表／參數，代碼路徑只有一條
- **雙向依賴禁止**：A 認識 B，B 就不得認識 A。含透過事件、callback、共用可變狀態
  互相呼叫。發現既有雙向依賴 → 停下回報，不得自行改依賴方向
- 新模組定案時寫出兩行：**對外進入點是哪一個**、**誰依賴它**；缺任一即為邊界未定，不得開工

## 九、派 agent 的安全規則

派 agent 前一律完整讀取 `<plugin>/rules/code-rules.md`，並把該檔「六、Subagent 專用」與
「三、禁止」兩節原文傳入 subagent 的 prompt；不得每次重寫、不得摘要。
