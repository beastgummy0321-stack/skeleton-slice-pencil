---
name: setup-workflow
description: 安裝本工作流的外部依賴 plugin（ponytail、i-have-adhd、mattpocock-skills、前端四件組 Frontend Pack）與 playwright-cli，並檢查環境（node）。換新機器或給他人安裝本 plugin 後跑一次。觸發：setup-workflow、安裝工作流依賴、環境檢查。
disable-model-invocation: true
---

# /setup-workflow 環境安裝（每台機器一次）

## 一、檢查（唯讀，先做完再問）

逐項檢查並列結果表（項目｜狀態｜影響）：

1. `node --version`——本 plugin 的 hooks 依賴 node；查無 → 規範注入與派工閘門失效，skill 本體仍可用
2. `claude plugin list` 含 `ponytail`、`i-have-adhd`、`mattpocock-skills` 與否
3. Frontend Pack（有前端才需要）：`claude plugin list` 含 `ui-ux-pro-max`、`taste-skill`、`impeccable` 與否；
   `~/.claude/skills/humanizer-zh-tw/SKILL.md` 存在與否。查無 → /skeleton 第 4 節「缺件降級」條款生效
4. `playwright-cli --version`——workflow.md Gate 的「驗工單先走一遍」靠它；查無 → 該步跳過，驗工單全部回到使用者手上。
   `~/.claude/settings.json` 的 `permissions.allow` 含 `Bash(playwright-cli:*)` 與否；查無 → 背景小幫手撞權限提問卡死

## 二、安裝（列清單，使用者點頭才執行；未點頭不得裝任何東西）

缺哪個裝哪個：

```bash
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail

claude plugin marketplace add ayghri/i-have-adhd
claude plugin install i-have-adhd@i-have-adhd

claude plugin install mattpocock-skills@claude-plugins-official

npm install -g @playwright/cli@latest
```

`playwright-cli` 裝完，在 `~/.claude/settings.json` 的 `permissions.allow` 加一行 `"Bash(playwright-cli:*)"`。

### Frontend Pack（純後端專案不裝）

裝前先告知使用者：ui-ux-pro-max 帶 7 個 skill、taste-skill 帶 13 個，impeccable 另帶 23 個 `/impeccable` 指令。
安裝後 skill 清單多 20 項，每 session 佔 description 列表。只做後端就不裝。

```bash
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill

claude plugin marketplace add leonxlnx/taste-skill
claude plugin install taste-skill@taste-skill

claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable
```

humanizer-zh-tw 不是 plugin（repo 根只有 SKILL.md），手動裝（單行，PowerShell 不吃反斜線續行）：

```bash
git clone --depth 1 https://github.com/kevintsai1202/Humanizer-zh-TW ~/.claude/skills/humanizer-zh-tw
```

## 三、驗證（裝完必做）

1. `claude plugin list` 逐項確認出現。裝了 Frontend Pack 的機器另確認 `~/.claude/skills/humanizer-zh-tw/SKILL.md` 存在（它不是 plugin，不會出現在 plugin list）。
2. 提醒使用者重開 session 讓 hooks 生效。
3. 重開後開場橫幅出現「skeleton-slice rules (injected every session)」字樣＝注入成功；沒出現 → 查 node 是否在 PATH。

## 四、衝突排除

`~/.claude/CLAUDE.md` 已用 @ 匯入 workflow.md／reuse-first.md 的機器：
本 plugin 的 SessionStart 注入與其重複 → 二選一，把 @ 匯入行移除或停用本 plugin 的 hook，不得雙載。
