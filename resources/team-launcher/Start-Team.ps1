$ErrorActionPreference = 'Stop'
function Find-Workbench {
  $roots = @("$env:APPDATA\Microsoft\Windows\Start Menu\Programs", "$env:ProgramData\Microsoft\Windows\Start Menu\Programs", [Environment]::GetFolderPath('Desktop'))
  $wscript = New-Object -ComObject WScript.Shell
  foreach ($root in $roots) {
    if (!(Test-Path -LiteralPath $root)) { continue }
    foreach ($link in Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -ErrorAction SilentlyContinue) {
      $target = $wscript.CreateShortcut($link.FullName).TargetPath
      if ($target -and [IO.Path]::GetFileName($target) -eq 'nightfall-workbench.exe' -and (Test-Path -LiteralPath $target)) { return $target }
    }
  }
  return $null
}
try {
  $manifest = Join-Path $PSScriptRoot 'team.nightfall-team.json'
  if (!(Test-Path -LiteralPath $manifest)) { throw 'Missing team configuration. Extract the complete ZIP first.' }
  $workbench = Find-Workbench
  if ($workbench) {
    $versionText = [Diagnostics.FileVersionInfo]::GetVersionInfo($workbench).ProductVersion -replace '\+.*$', ''
    $installedVersion = $null
    if (![Version]::TryParse($versionText, [ref]$installedVersion) -or $installedVersion -lt [Version]'0.2.0') { $workbench = $null }
  }
  if (!$workbench) {
    $installer = Join-Path $PSScriptRoot 'Nightfall_Setup.exe'
    if (!(Test-Path -LiteralPath $installer)) { throw 'Install Nightfall Workbench first, then run this launcher again. Ask your team owner for the matching installer.' }
    $expected = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installer.sha256') -Raw).Trim()
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Installer checksum mismatch. Download the team package again.' }
    Start-Process -FilePath $installer -Wait
    $workbench = Find-Workbench
    if (!$workbench) { throw 'Installation was not completed. Keep Start menu shortcuts enabled and try again.' }
  }
  Start-Process -FilePath $workbench -ArgumentList @('--team', ('"' + $manifest + '"')) -WindowStyle Hidden
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
