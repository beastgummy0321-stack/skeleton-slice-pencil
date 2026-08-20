<#
PEN-OPT-1  Pencil 接線 preflight
用途：把「每個 session 都要重演的手動排錯」變成一個指令，並且讓設計檔落在 repo 路徑下。

原理（實測 1.2.0）：
- Pen.exe 冷啟動一律進儀表板，不吃命令列參數
- 但 app 已在跑的時候再啟動一次並帶檔案路徑，參數會被轉發給既有實例，直接開那個檔
- 所以「啟動兩次」比去點儀表板可靠得多，也不需要 a11y／computer-use

用法：  powershell -File bin/pencil-preflight.ps1 -PenFile <絕對路徑.pen>
輸出：  最後一行 = 開啟中的 .pen 路徑（給 MCP filePath 用）
離開碼：0 成功；1 失敗
#>
param(
  [Parameter(Mandatory = $true)][string]$PenFile,
  [string]$PenExe = "D:\pencil\Pen.exe"
)

function Fail($msg) { Write-Error $msg; exit 1 }

function Get-PenTitle {
  $p = Get-Process -Name "Pen" -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
  if ($p) { return $p.MainWindowTitle }
  return $null
}

if (-not (Test-Path $PenExe)) { Fail "找不到 Pencil 執行檔：$PenExe（1.2.0 裝在 D:\pencil，不是 %LOCALAPPDATA%）" }

$dir = Split-Path -Parent $PenFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# 種子檔。Pencil 開不了不存在的路徑，也沒有「另存新檔到這裡」的自動化管道。
if (-not (Test-Path $PenFile)) {
  '{ "version": "2.17", "children": [] }' | Out-File -FilePath $PenFile -Encoding utf8
  Write-Host "建立種子檔 $PenFile"
}

if (-not (Get-Process -Name "Pen" -ErrorAction SilentlyContinue)) {
  Write-Host "Pencil 未啟動，開起來…"
  Start-Process -FilePath $PenExe
  for ($i = 0; $i -lt 20 -and -not (Get-PenTitle); $i++) { Start-Sleep -Seconds 1 }
  if (-not (Get-PenTitle)) { Fail "Pencil 啟動失敗" }
}

# 第二次啟動：參數被轉發給既有實例，直接開檔，繞過儀表板。
Start-Process -FilePath $PenExe -ArgumentList $PenFile -WorkingDirectory $dir
$want = "file:///" + $PenFile.Replace([char]92, [char]47)
$title = $null
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  $title = Get-PenTitle
  if ($title -eq $want) { break }
}
if ($title -ne $want) { Fail "開檔失敗。期待 $want，實際 $title" }

# 前景。Electron 背景節流：視窗不在前景時 canvas 不 render，TakeScreenshot 會回全白。
$target = Get-Process -Name "Pen" | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 1
(New-Object -ComObject WScript.Shell).AppActivate($target.Id) | Out-Null
Start-Sleep -Seconds 2

Write-Host "OK 已開檔並置前景。"
Write-Host "設計完要落盤，跑 rules/pencil-bridge.md 的 dump 程序。Ctrl+S 無效（實測 file-backed 檔案也不寫）。"
Write-Output $PenFile
exit 0
