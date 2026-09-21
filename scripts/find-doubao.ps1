<#
.SYNOPSIS
  Doubao Skin Studio - 探测两个豆包客户端和 node 路径
.DESCRIPTION
  打印自动探测到的 Doubao.exe、DoubaoWork.exe 和 node 路径
#>
$ErrorActionPreference = 'Continue'

function Find-DoubaoExe([string]$Directory, [string]$Executable, [string]$EnvironmentVariable) {
  $environmentPath = [Environment]::GetEnvironmentVariable($EnvironmentVariable)
  if ($environmentPath -and (Test-Path -LiteralPath $environmentPath)) { return $environmentPath }

  $relative = Join-Path $Directory $Executable
  $candidates = @()
  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA $relative
    $candidates += Join-Path $env:LOCALAPPDATA (Join-Path 'Programs' $relative)
  }
  if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles $relative }
  if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} $relative }
  foreach ($c in $candidates) { if (Test-Path -LiteralPath $c) { return $c } }
  try {
    $keys = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
    foreach ($k in $keys) {
      Get-ItemProperty $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*$Directory*" -and $_.InstallLocation } | ForEach-Object {
        $p = Join-Path $_.InstallLocation $Executable
        if (Test-Path -LiteralPath $p) { return $p }
      }
    }
  } catch {}
  return $null
}

function Find-Node {
  $g = Get-Command node -ErrorAction SilentlyContinue
  if ($g) { return $g.Source }
  return $null
}

$personalExe = Find-DoubaoExe 'Doubao' 'Doubao.exe' 'DOUBAO_EXE'
$workExe = Find-DoubaoExe 'DoubaoWork' 'DoubaoWork.exe' 'DOUBAO_WORK_EXE'
$node = Find-Node
Write-Host "=== Doubao Skin Studio 探测结果 ==="
Write-Host "Doubao.exe:     $(if ($personalExe) { $personalExe } else { '未找到' })"
Write-Host "DoubaoWork.exe: $(if ($workExe) { $workExe } else { '未找到' })"
Write-Host "node:           $(if ($node) { $node } else { '未找到' })"
if (-not $personalExe -or -not $workExe) {
  Write-Host ""
  Write-Host "可设置 DOUBAO_EXE 或 DOUBAO_WORK_EXE，或运行 apply.ps1 时传入 -DoubaoExe。"
}
if (-not $node) {
  Write-Host ""
  Write-Host "未找到 node，请安装 Node.js 18+ 并确保在 PATH。"
}
