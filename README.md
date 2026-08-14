# skeleton-slice

Claude Code 開發工作流：**骨架日一次、之後一片一片切**。
給非工程背景的使用者：AI 一次問一題、給選項帶推薦、斷線重開能接著走。

## 內容

| 檔案 | 裝到哪 | 作用 |
|---|---|---|
| `skills/skeleton/` | `~/.claude/skills/skeleton/` | 骨架日：每專案跑一次。新專案建地基；舊專案接管（只加不改＋盤點） |
| `skills/slice/` | `~/.claude/skills/slice/` | 之後的一切入口：自動分流（快改／五站切片）、斷點續跑、完成即刪看板行 |
| `skills/container-contract/` | `~/.claude/skills/container-contract/` | 集裝箱憲章的觸發器 |
| `container-contract.md` | `~/.claude/container-contract.md` | 集裝箱憲章本體：模組邊界五原則（唯一進入點、狀態不外洩、依賴單向、錯誤不穿牆、接口即契約） |

## 安裝

Windows（PowerShell）：

```powershell
git clone https://github.com/beastgummy0321-stack/skeleton-slice.git
Copy-Item -Recurse skeleton-slice\skills\* "$env:USERPROFILE\.claude\skills\"
Copy-Item skeleton-slice\container-contract.md "$env:USERPROFILE\.claude\"
```

macOS／Linux：

```bash
git clone https://github.com/beastgummy0321-stack/skeleton-slice.git
cp -r skeleton-slice/skills/* ~/.claude/skills/
cp skeleton-slice/container-contract.md ~/.claude/
```

裝完重開一個 Claude Code session，skill 即自動註冊。

## 前置依賴（skill 會點名它們，需先裝）

- [mattpocock/skills](https://github.com/mattpocock/skills)：grilling、to-tickets、tdd、domain-modeling
- [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill)：前端生成
- [pbakaus/impeccable](https://github.com/pbakaus/impeccable)：前端打磨
- [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)：風格方向

## 提示詞用法

**1. 全新專案（空資料夾裡開第一句）**

```
/skeleton 全新專案，照骨架日流程帶我走。
一次問我一題；要安裝任何東西，先列清單給我點頭。
```

**2. 舊專案重啟（有舊看板、舊 grill 文檔堆積）**

```
/skeleton 接管舊專案。原始碼只加不改。
舊的 grill 文檔、舊看板、工程紀錄一律不要讀，先問我要封存還是刪除。
盤點完成後，給我一份全新的看板和建議的遷移順序。
```

**3. 日常開發（骨架日之後的一切）**

```
/slice 我想要＜用白話描述你要的功能或修改＞
```

續跑只要兩個字：

```
/slice 繼續
```

## 流程一頁圖

```
/skeleton（每專案一次）
  地基＋看板 BOARD.md＋專案 CLAUDE.md＋機器糾察隊

/slice（之後的一切）
  分流：A 只改樣式→直接改｜B 改行為不動合約→快改｜C 動合約→五站
  五站：①選畫面 → ②定形狀(只問 UNKNOWN) → ③假接線(四態原型)
        → ④做後端(照凍結 schema) → ⑤換真線(拔假資料，前端零改動)
  收工：看板刪行、git 當檔案館、過程檔即刪
```
