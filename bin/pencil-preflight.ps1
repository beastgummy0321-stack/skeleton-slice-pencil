<#
Pencil 接線 preflight（skeleton-slice pencil 版）

做三件事：確保 Pencil 在跑 → 置前景 → 確認編輯器裡有開檔。
沒有開檔的話所有 Pencil MCP 工具都會回 "A file needs to be open in the editor"。

實測邊界（1.2.0，不要再花時間重踩）：
- 冷啟動一律進儀表板，命令列參數不吃
- app 已在跑時二次啟動並帶「已存在的」.pen 路徑，參數會轉發並開啟該路徑，
  但**開出來的文件不含檔案內容**（實測：18,875 bytes 的檔案開起來找不到裡面的節點），
  而且之後 Insert 的節點不會 render。所以這條路禁用，只保留偵測用
- 唯一可靠的建檔方式是在 GUI 點儀表板的 New File／Design System
- 儀表板的 a11y tree 有時整個不曝露（只回 260 bytes），此時腳本無法代點，
  必須由人點一下。本腳本會明講，不會假裝成功

用法：  powershell -File bin/pencil-preflight.ps1 [-DesignDir <資料夾>]
輸出：  最後一行 = 開啟中的 .pen 路徑（給 MCP filePath 用）
離開碼：0 已就緒；1 環境錯誤；2 需要人工在 GUI 點 New File
#>
param(
  [string]$DesignDir = (Get-Location).Path,
  [string]$PenExe = "D:\pencil\Pen.exe",
  [string]$Orca = $(if ($env:ORCA_CLI_COMMAND) { $env:ORCA_CLI_COMMAND } else { "orca" })
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Fail($msg) { Write-Error $msg; exit 1 }
function NeedHuman($msg) { Write-Warning $msg; exit 2 }

function Get-PenProc {
  Get-Process -Name "Pen" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
}

if (-not (Test-Path $PenExe)) { Fail "找不到 Pencil 執行檔：$PenExe（1.2.0 裝在 D:\pencil，不是 %LOCALAPPDATA%）" }
if (-not (Test-Path $DesignDir)) { New-Item -ItemType Directory -Force -Path $DesignDir | Out-Null }

if (-not (Get-PenProc)) {
  Write-Host "Pencil 未啟動，開起來…"
  # cwd 設成設計資料夾：Pencil 的自動存檔曾經落在啟動時的工作目錄底下。
  Start-Process -FilePath $PenExe -WorkingDirectory $DesignDir
  for ($i = 0; $i -lt 25 -and -not (Get-PenProc); $i++) { Start-Sleep -Seconds 1 }
  if (-not (Get-PenProc)) { Fail "Pencil 啟動失敗" }
  Start-Sleep -Seconds 3
}

$p = Get-PenProc
# Electron 背景節流：視窗不在前景時 canvas 不 render，TakeScreenshot 會回全白。
(New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null
Start-Sleep -Seconds 2
$p = Get-PenProc

if ($p.MainWindowTitle -like "file:*") {
  Write-Host "OK 已開檔並置前景。"
  Write-Output ($p.MainWindowTitle -replace '^file:///', '').Replace([char]47, [char]92)
  exit 0
}

# 儀表板。先試著代點 New File；a11y tree 沒曝露就交給人。
Write-Host "目前在儀表板，試著代點 New File…"
$idx = $null
for ($i = 0; $i -lt 5 -and -not $idx; $i++) {
  if ($i -gt 0) { Start-Sleep -Seconds 2 }
  (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null
  $raw = & $Orca computer get-app-state --app "pid:$($p.Id)" --json --no-screenshot 2>$null
  if (-not $raw) { continue }
  try { $tree = ($raw | ConvertFrom-Json).result.snapshot.treeText } catch { continue }
  # 只比對 ASCII 的 "New File"（角色名會隨語系變）。視窗與外層區域也叫 New File
  # （index 0/1/2），按鈕是 index > 2 裡最小的那個；RECENT FILES 與 DESIGN SYSTEMS
  # 的項目排在後面，取最後一個會誤開 Halo 之類的範本。
  $idx = ($tree -split "`n" |
    Where-Object { $_ -cmatch 'New File\s*$' } |
    ForEach-Object { [int][regex]::Match($_, '(\d+)').Groups[1].Value } |
    Where-Object { $_ -gt 2 } | Sort-Object | Select-Object -First 1)
}

if (-not $idx) {
  NeedHuman "Pencil 的 a11y tree 沒曝露畫面內容，腳本點不到。請在 Pencil 視窗手動點 New File（要用 shadcn 元件就點 DESIGN SYSTEMS 的 shadcn/ui），然後重跑本腳本。"
}

& $Orca computer click --app "pid:$($p.Id)" --element-index $idx --json --no-screenshot | Out-Null
for ($i = 0; $i -lt 8; $i++) {
  Start-Sleep -Seconds 2
  $p = Get-PenProc
  if ($p.MainWindowTitle -like "file:*") { break }
}
if ($p.MainWindowTitle -notlike "file:*") {
  NeedHuman "代點之後仍停在儀表板。請人工點 New File 再重跑。"
}

Write-Host "OK 已開檔並置前景。"
Write-Output ($p.MainWindowTitle -replace '^file:///', '').Replace([char]47, [char]92)
exit 0
