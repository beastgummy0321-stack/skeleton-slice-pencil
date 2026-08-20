<#
PEN-OPT-1  Pencil 接線 preflight
用途：把「每個 session 都要重演的 3 分鐘手動排錯」變成一個指令。
做四件事：確保 app 在跑 → 抓到前景 → 確保編輯器裡有開檔 → 印出 doc 路徑。
沒有開檔的話所有 Pencil MCP 工具都會回 "A file needs to be open in the editor"。

用法：  powershell -File bin/pencil-preflight.ps1
輸出：  最後一行 = 目前開啟的 .pen 路徑（給 MCP filePath 用）
離開碼：0 成功；1 失敗（訊息在 stderr）
#>
param(
  [string]$PenExe = "D:\pencil\Pen.exe",
  [string]$Orca = $(if ($env:ORCA_CLI_COMMAND) { $env:ORCA_CLI_COMMAND } else { "orca" })
)

function Fail($msg) { Write-Error $msg; exit 1 }

function Get-PenWindowTitle {
  $raw = & $Orca computer list-windows --app Pen --json 2>$null
  if (-not $raw) { return $null }
  try { $j = $raw | ConvertFrom-Json } catch { return $null }
  if (-not $j.ok) { return $null }
  return $j.result.windows[0].title
}

if (-not (Test-Path $PenExe)) { Fail "找不到 Pencil 執行檔：$PenExe（1.2.0 裝在 D:\pencil，不是 %LOCALAPPDATA%）" }

$proc = Get-Process -Name "Pen" -ErrorAction SilentlyContinue
if (-not $proc) {
  Write-Host "Pencil 未啟動，開起來…"
  Start-Process -FilePath $PenExe
  Start-Sleep -Seconds 10
  $proc = Get-Process -Name "Pen" -ErrorAction SilentlyContinue
  if (-not $proc) { Fail "Pencil 啟動失敗" }
}

# 抓前景。Pencil 是 Electron，視窗在背景時 canvas 不 render，
# TakeScreenshot 會回傳全白——這不是 bug，是背景節流。
$target = ($proc | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1)
if (-not $target) { Fail "Pencil 沒有可見視窗" }
$shell = New-Object -ComObject WScript.Shell
$shell.AppActivate($target.Id) | Out-Null
Start-Sleep -Seconds 2

$title = Get-PenWindowTitle
if (-not $title) { Fail "orca computer 讀不到 Pencil 視窗，先跑 `"$Orca status --json`"" }

# 儀表板（title = "New File"）代表編輯器裡沒有開檔，MCP 全部工具都會失敗。
if ($title -eq "New File") {
  Write-Host "目前在儀表板，點 New File…"
  $raw = & $Orca computer get-app-state --app Pen --json --no-screenshot 2>$null
  $tree = ($raw | ConvertFrom-Json).result.snapshot.treeText
  $line = ($tree -split "`n" | Where-Object { $_ -match '^\s*(\d+)\s+按鈕 New File\s*$' } | Select-Object -First 1)
  if (-not $line) { Fail "儀表板上找不到 New File 按鈕（UI 可能改版，請人工開檔）" }
  $idx = [regex]::Match($line, '(\d+)').Groups[1].Value
  & $Orca computer click --app Pen --element-index $idx --json --no-screenshot | Out-Null
  Start-Sleep -Seconds 4
  $title = Get-PenWindowTitle
}

if ($title -eq "New File" -or -not $title.StartsWith("file:")) { Fail "開檔失敗，目前視窗標題：$title" }

# file:///C:/... -> C:\...
$path = $title -replace '^file:///', '' -replace '/', '\'
Write-Host "OK 已開檔。注意：這是 Pencil 自己的 library 路徑，不是 repo 路徑。"
Write-Host "設計完要落盤，跑 rules/pencil-bridge.md 的 dump 程序，Ctrl+S 沒有用。"
Write-Output $path
exit 0
