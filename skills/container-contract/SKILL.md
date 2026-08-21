---
name: container-contract
description: 集裝箱憲章——模組邊界規則：唯一進入點、狀態不外洩、錯誤不穿牆、接口即契約、好找優先、拔根測試。開新模組、重構、定接口、談依賴或邊界時使用。觸發：集裝箱、模組邊界、進入點、依賴方向、連根拔起。
---

# 集裝箱憲章 skill

本體：本 plugin 的 `rules/container-contract.md`（本 SKILL.md 上兩層的 rules 目錄），約 20 行，先讀完。

1. 新模組 → 票裡先寫齊登記四行（entry、I/O shape、callers、must-not-touch），缺一不開工。
2. 派實作或審查 subagent 時，把本體原文附進 prompt，不摘要。
3. 審查只核對本體第 1～6 點，一條一行「過／不過＋`file:line`」；審查者不得是實作者。
