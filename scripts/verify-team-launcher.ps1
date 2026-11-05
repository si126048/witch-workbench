param([Parameter(Mandatory=$true)][string]$LauncherPath,[Parameter(Mandatory=$true)][string]$ExpectedExecutable)
$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('nightfall-launcher-' + [Guid]::NewGuid().ToString('N'))
$resolvedTestDirectory = [IO.Path]::GetFullPath($testDirectory)
if (![IO.Path]::GetDirectoryName($resolvedTestDirectory).Equals([IO.Path]::GetTempPath().TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) -or ![IO.Path]::GetFileName($resolvedTestDirectory).StartsWith('nightfall-launcher-')) { throw 'Unexpected test directory' }
[void](New-Item -ItemType Directory -Path $testDirectory)
$global:NightfallLauncherCalls = New-Object System.Collections.Generic.List[object]
$global:NightfallLauncherProcess = $null
$originalUserData = $env:NIGHTFALL_USER_DATA_DIR
$env:NIGHTFALL_USER_DATA_DIR = Join-Path $testDirectory 'user-data'
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class NightfallWindowCheck { [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window); }'
function Start-Process {
  param([string]$FilePath,[string[]]$ArgumentList,[switch]$Wait,[string]$WindowStyle)
  $global:NightfallLauncherCalls.Add(@{file=$FilePath;arguments=$ArgumentList;windowStyle=$WindowStyle})
  $global:NightfallLauncherProcess = Microsoft.PowerShell.Management\Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WindowStyle $WindowStyle -PassThru
}
try {
  Copy-Item -LiteralPath $LauncherPath -Destination (Join-Path $testDirectory 'Start-Team.ps1')
  $configuration = Join-Path $testDirectory 'team.nightfall-team.json'
  [IO.File]::WriteAllText($configuration, '{"kind":"nightfall-team","version":1,"name":"Launcher acceptance","remote":"https://example.invalid/team/game.git","branch":"main","sdkVersion":"8.5.3"}')
  & (Join-Path $testDirectory 'Start-Team.ps1')
  if ($global:NightfallLauncherCalls.Count -ne 1) { throw 'Expected exactly one workbench launch' }
  $launch = $global:NightfallLauncherCalls[0]
  if (![IO.Path]::GetFullPath($launch.file).Equals([IO.Path]::GetFullPath($ExpectedExecutable), [StringComparison]::OrdinalIgnoreCase)) { throw 'Launcher chose an unexpected installation' }
  if ($launch.arguments[0] -ne '--team' -or $launch.arguments[1] -ne ('"' + $configuration + '"')) { throw 'Launcher did not preserve the quoted team configuration path' }
  if ($launch.windowStyle -ne 'Hidden') { throw 'Launcher helper window must stay hidden' }
  $visible = $false
  for ($attempt=0; $attempt -lt 60; $attempt++) {
    $global:NightfallLauncherProcess.Refresh()
    if ($global:NightfallLauncherProcess.HasExited) { throw 'Launched workbench exited before displaying its window' }
    if ($global:NightfallLauncherProcess.MainWindowHandle -ne [IntPtr]::Zero -and [NightfallWindowCheck]::IsWindowVisible($global:NightfallLauncherProcess.MainWindowHandle)) { $visible=$true; break }
    Start-Sleep -Milliseconds 500
  }
  if (!$visible) { throw 'Launcher did not show a visible workbench window on the isolated desktop' }
  @{passed=$true;installedVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($ExpectedExecutable).ProductVersion;installedShortcutDiscovery=$true;quotedConfiguration=$true;actualLaunch=$true;visibleWindow=$true} | ConvertTo-Json | Set-Content -Encoding UTF8 acceptance-output\team-launcher.json
  Write-Output 'Installed launcher discovery, version check and quoted arguments passed'
} finally {
  if ($global:NightfallLauncherProcess -and !$global:NightfallLauncherProcess.HasExited) { & "$env:SystemRoot\System32\taskkill.exe" /PID $global:NightfallLauncherProcess.Id /T /F | Out-Null }
  $env:NIGHTFALL_USER_DATA_DIR = $originalUserData
  Remove-Item -LiteralPath $resolvedTestDirectory -Recurse -Force
  Remove-Variable -Name NightfallLauncherCalls -Scope Global -ErrorAction SilentlyContinue
  Remove-Variable -Name NightfallLauncherProcess -Scope Global -ErrorAction SilentlyContinue
}
