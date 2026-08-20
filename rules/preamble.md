# skeleton-slice 全域規範（plugin 注入，每 session 生效）

以下四份為本工作流的強制規範，全文注入如後：workflow.md（多 Agent／Codex 分工）、
reuse-first.md（不重複造輪）、code-rules.md（Code 階段硬規定）。
container-contract.md 與 screen-contract.md 由 /skeleton、/slice、/container-contract 於用到時載入原文。
pencil-bridge.md（pen.dev 設計檔接線）由 /skeleton 第 4 節於用到 Pencil 時載入原文；沒用 Pencil 就不載。

## 驗證紀律（強制）

- 新增的檢查要當場證明它會紅：把被測行為弄壞、看它失敗、再改回來。沒驗過的檢查不得宣告有效
- 說「沒有 X」之前先確認搜尋範圍涵蓋 X 可能存在的所有位置；搜不到不等於沒有
- 驗證腳本的輸出量級對不上預期時，先修腳本，不得據此下結論
- 派 agent 一律把 code-rules.md「六、Subagent 專用」與「三、禁止」兩節原文傳入 prompt，不得重寫、不得摘要

## 檔案大小與讀取（強制）

- 單檔超過 800 行即為待拆，不得再往裡面加新功能；要加就先拆
- 派 subagent 讀檔一律指定行號範圍或用 Grep 定位，禁止整檔讀
- 規範檔（CLAUDE.md／AGENTS.md 及其點名的 .md）只寫可判定的禁令句，不寫勸導句；
  由本 plugin 的 load-budget hook 自動把關

---
