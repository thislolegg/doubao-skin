<#
.SYNOPSIS
  Doubao Skin Studio - Windows pause
.DESCRIPTION
  暂停皮肤，恢复原生界面（不重启客户端）
.PARAMETER Port
  CDP 调试端口。豆包默认 9333，豆包工作默认 9334
.PARAMETER Client
  客户端：auto、personal 或 work
#>
[CmdletBinding()]
param(
  [int]$Port = 0,
  [ValidateSet('auto', 'personal', 'work')]
  [string]$Client = 'auto'
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Resolve-DoubaoClient {
  if ($Client -ne 'auto') { return $Client }
  if ($env:DOUBAO_CLIENT -in @('personal', 'work')) { return $env:DOUBAO_CLIENT }

  try {
    $cursor = $PID
    for ($depth = 0; $depth -lt 20 -and $cursor -gt 0; $depth++) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $cursor" -ErrorAction Stop
      $identity = "$($process.ExecutablePath) $($process.CommandLine)"
      if ($identity -match '[\\/]DoubaoWork(\.exe|[\\/])') { return 'work' }
      if ($identity -match '[\\/]Doubao(\.exe|[\\/])') { return 'personal' }
      $cursor = [int]$process.ParentProcessId
    }
  } catch {}

  if ($Root -match '[\\/](DoubaoWork)[\\/]' -or $Root -match '[\\/]\.doubaowork[\\/]') {
    return 'work'
  }
  if ($Root -match '[\\/](Doubao)[\\/]' -or $Root -match '[\\/]\.doubao[\\/]') {
    return 'personal'
  }

  $workRunning = [bool](Get-Process DoubaoWork -ErrorAction SilentlyContinue)
  $personalRunning = [bool](Get-Process Doubao -ErrorAction SilentlyContinue)
  if ($workRunning -and -not $personalRunning) { return 'work' }
  return 'personal'
}

function Find-Node {
  $g = Get-Command node -ErrorAction SilentlyContinue
  if ($g) { return $g.Source }
  return $null
}

$clientId = Resolve-DoubaoClient
if ($Port -eq 0) { $Port = if ($clientId -eq 'work') { 9334 } else { 9333 } }
if ($Port -lt 1024 -or $Port -gt 65535) {
  Write-Error "Port 必须是 1024 到 65535 的整数"
  exit 1
}

$node = Find-Node
if (-not $node) { Write-Error "未找到 node。"; exit 1 }
Write-Host "Client: $(if ($clientId -eq 'work') { '豆包工作' } else { '豆包' })"
& $node (Join-Path $Root 'src/cli.mjs') pause --client $clientId --port $Port
