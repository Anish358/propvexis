<#
  PropVexis MT5 sync agent — Windows box setup.

  Run once on a fresh Windows Server 2022 box, from an elevated PowerShell:

      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\setup.ps1 -ApiBase https://app-dev.propvexis.com -WorkerToken <token> -WorkerId sync-01

  The point of this script is that the box is DISPOSABLE. Provider pricing for
  Windows moves around ($22/mo Lightsail vs ~$12/mo Contabo vs $46/mo EC2), and the
  only way that stays a cheap decision is if rebuilding elsewhere is re-running
  this file rather than remembering what was clicked.

  What it cannot do: download each prop firm's own MT5 build. White-label servers
  are usually absent from the MetaQuotes server list, so the firm's installer
  (which ships the .srv file) has to be fetched by hand. That step is printed at
  the end and is the one genuinely manual part of adding a firm.
#>
param(
  [Parameter(Mandatory = $true)][string]$ApiBase,
  [Parameter(Mandatory = $true)][string]$WorkerToken,
  [string]$WorkerId = 'sync-01',
  [string]$AgentDir = 'C:\propvexis\agent',
  [string]$Mt5Root  = 'C:\mt5'
)

$ErrorActionPreference = 'Stop'

Write-Host '== PropVexis sync agent setup ==' -ForegroundColor Cyan

# UTC on the box. The agent derives the broker's offset from a live tick and
# compares it to its own clock, so a box on local time makes every calibration
# read wrong by that offset.
Write-Host '-- setting timezone to UTC'
tzutil /s 'UTC'

Write-Host '-- installing Python'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}
python --version

Write-Host "-- laying out $AgentDir"
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
Copy-Item -Path "$PSScriptRoot\*.py", "$PSScriptRoot\requirements.txt" -Destination $AgentDir -Force

Push-Location $AgentDir
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Pop-Location

Write-Host '-- writing config.json'
# 0600-equivalent: SYSTEM and Administrators only. The worker token in here can
# lease every account due for a sync, so it is the most sensitive file on the box.
$config = [ordered]@{
  api_base         = $ApiBase
  worker_token     = $WorkerToken
  worker_id        = $WorkerId
  poll_secs        = 30
  post_delay_ms    = 50
  default_terminal = "$Mt5Root\default\terminal64.exe"
  firms            = @{ gft = @{ terminal = "$Mt5Root\gft\terminal64.exe" } }
}
$configPath = Join-Path $AgentDir 'config.json'
$config | ConvertTo-Json -Depth 5 | Set-Content -Path $configPath -Encoding UTF8

$acl = Get-Acl $configPath
$acl.SetAccessRuleProtection($true, $false)
$acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
foreach ($who in 'NT AUTHORITY\SYSTEM', 'BUILTIN\Administrators') {
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $who, 'FullControl', 'Allow')))
}
Set-Acl -Path $configPath -AclObject $acl

Write-Host "-- creating $Mt5Root firm directories"
foreach ($firm in 'default', 'gft') {
  New-Item -ItemType Directory -Force -Path (Join-Path $Mt5Root $firm) | Out-Null
}

Write-Host '-- registering the scheduled task'
# Task Scheduler rather than a service: MT5 wants a desktop session, and NSSM is
# another dependency to install on every rebuild. Restart-on-failure is what keeps
# a single box honest — plus the backend heartbeat alert for when that is not enough.
$action  = New-ScheduledTaskAction -Execute 'python' -Argument 'sync_agent.py' -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'PropVexisSyncAgent' -Action $action -Trigger $trigger `
  -Settings $settings -RunLevel Highest -User 'SYSTEM' -Force | Out-Null

Write-Host ''
Write-Host '== done ==' -ForegroundColor Green
Write-Host @"
STILL MANUAL — one per prop firm:

  1. Download the firm's own MT5 installer (GoatFundedTrader's client area for GFT).
     The MetaQuotes build does NOT know white-label servers like GoatFunded-Server.
  2. Install it into $Mt5Root\<firm>\  and launch it once with /portable:
         $Mt5Root\<firm>\terminal64.exe /portable
     Log in by hand once to confirm the server appears and the investor password
     works, then close it.
  3. Add the firm to `firms` in $configPath if it is not there.

Then start the agent:   Start-ScheduledTask -TaskName PropVexisSyncAgent
Watch it:               Get-Content $AgentDir\agent.log -Wait -Tail 20
"@
