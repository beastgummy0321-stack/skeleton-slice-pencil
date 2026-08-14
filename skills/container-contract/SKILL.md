---
name: container-contract
description: 集裝箱憲章——模組邊界的強制規則：唯一進入點、狀態不外洩、依賴單向、錯誤不穿牆、接口即契約。凡是開新模組、實作、重構、拆模組、定介面／接口、談依賴或邊界時使用。觸發：集裝箱、模組邊界、邊界隔離、進入點、依賴方向。
---

# 集裝箱憲章 skill

## 一、開場（不得跳過）

1. 讀 `~/.claude/container-contract.md` 全文。
2. 本次任務涉及新模組 → 照憲章一收齊邊界定案四行，缺一不得開工。
3. 只改模組內部、不碰進入點與依賴 → 說明後照常進行，憲章三、五仍適用。

## 二、派 agent

派實作或驗證 subagent 時，把 `~/.claude/container-contract.md` 原文附進 prompt，
不得摘要、不得重寫（同 workflow.md 第六節對 agent-safety.md 的做法）。

## 三、交件前

照憲章二～六逐條核對，一條一行寫「過／不過＋證據位置」。
驗證由非實作者執行（workflow.md 第三節常設編制）。
