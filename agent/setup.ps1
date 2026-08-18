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
  [string]$Mt5Root  = 'C:\mt5',
  [string]$AgentUser = 'pvsync',
  [string]$Region = 'ap-south-1',
  # NOT under /amey-journal/* on purpose: platform/secrets.js maps every parameter
  # under that prefix into the backend's process.env, so a Windows password there
  # would end up as an environment variable on the API box.
  [string]$AutologonPasswordParam = '/propvexis/sync-farm/AUTOLOGON_PASSWORD',
  [string]$aws = "$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe"
)

$ErrorActionPreference = 'Stop'

Write-Host '== PropVexis sync agent setup ==' -ForegroundColor Cyan

# UTC on the box. The agent derives the broker's offset from a live tick and
# compares it to its own clock, so a box on local time makes every calibration
# read wrong by that offset.
Write-Host '-- setting timezone to UTC'
tzutil /s 'UTC'

Write-Host '-- installing Python 3.12'
# NOT winget: Windows Server 2022 does not ship it, so `winget install` fails on
# exactly the OS this script is written for. Direct download instead.
#
# 3.12 specifically, not "latest": the MetaTrader5 wheel is Windows-only and
# publishes no build for 3.13 yet.
$py = "$env:ProgramFiles\Python312\python.exe"
if (-not (Test-Path $py)) {
  $ProgressPreference = 'SilentlyContinue'
  New-Item -ItemType Directory -Force -Path C:\propvexis\dl | Out-Null
  Invoke-WebRequest -UseBasicParsing -OutFile C:\propvexis\dl\python.exe `
    -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'
  Start-Process C:\propvexis\dl\python.exe -Wait `
    -ArgumentList '/quiet','InstallAllUsers=1','PrependPath=1','Include_test=0'
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
}
& $py --version

Write-Host "-- laying out $AgentDir"
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
Copy-Item -Path "$PSScriptRoot\*.py", "$PSScriptRoot\requirements.txt" -Destination $AgentDir -Force

Push-Location $AgentDir
& $py -m pip install --no-warn-script-location --upgrade pip
& $py -m pip install --no-warn-script-location -r requirements.txt
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
# WriteAllText with an explicit no-BOM encoder, because Set-Content -Encoding UTF8
# on Windows PowerShell 5.1 prepends a BOM. The agent tolerates one now, but a
# config file that only some JSON parsers accept is a trap for the next tool.
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5),
  (New-Object System.Text.UTF8Encoding($false)))

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

# ---------------------------------------------------------------------------
# THE AGENT MUST RUN IN AN INTERACTIVE SESSION. This is not a preference.
#
# Running it as SYSTEM (session 0) was tried first and does not work: terminal64.exe
# starts, but session 0 has no window station, so the terminal's IPC endpoint never
# comes up and mt5.initialize() fails with (-10005, 'IPC timeout') — indistinguishable
# from a dead terminal. Verified on Windows Server 2022, twice, with a 180s timeout.
#
# So the box logs itself in as a dedicated account and the agent runs at logon.
# ---------------------------------------------------------------------------
Write-Host '-- creating the agent account'
$pw = & $aws ssm get-parameter --region $Region --name $AutologonPasswordParam `
        --with-decryption --query Parameter.Value --output text
if (-not $pw -or $pw.Length -lt 16) { throw "no autologon password at $AutologonPasswordParam" }

# A STANDARD user, not an administrator. MT5 writes only inside its own portable
# folder, so the account gets Modify on those two trees and nothing else. An
# autologon account is a standing credential and should hold the least it can.
if (-not (Get-LocalUser -Name $AgentUser -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $AgentUser -Password (ConvertTo-SecureString $pw -AsPlainText -Force) `
    -FullName 'PropVexis sync agent' -Description 'Runs the MT5 sync agent interactively' `
    -PasswordNeverExpires | Out-Null
} else {
  Set-LocalUser -Name $AgentUser -Password (ConvertTo-SecureString $pw -AsPlainText -Force)
}
foreach ($dir in $Mt5Root, 'C:\propvexis') {
  $dacl = Get-Acl $dir
  $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $AgentUser, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  Set-Acl -Path $dir -AclObject $dacl
}
# READ, not Modify: the agent has no reason to rewrite the file holding its token.
# Without this the protected ACL above locks the agent out of its own config.
$cacl = Get-Acl $configPath
$cacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
  $AgentUser, 'Read', 'Allow')))
Set-Acl -Path $configPath -AclObject $cacl

Write-Host '-- configuring autologon'
# Sysinternals Autologon stores the password as an ENCRYPTED LSA SECRET. The registry
# AutoAdminLogon + DefaultPassword route leaves it in plaintext for any local admin
# to read — identical functionality, strictly worse trade.
Invoke-WebRequest -UseBasicParsing -Uri 'https://live.sysinternals.com/Autologon64.exe' `
  -OutFile C:\propvexis\dl\Autologon64.exe
Start-Process C:\propvexis\dl\Autologon64.exe -Wait `
  -ArgumentList '-accepteula', $AgentUser, $env:COMPUTERNAME, $pw

Write-Host '-- registering the scheduled task (at logon, interactive)'
$action  = New-ScheduledTaskAction -Execute $py -Argument 'sync_agent.py' -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $AgentUser
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $AgentUser -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'PropVexisSyncAgent' -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

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

Then REBOOT. Autologon creates the interactive session and the task starts in it:
    Restart-Computer -Force

Verify it landed in session 1 (session 0 cannot run MT5):
    quser
    Get-Process python,terminal64 | Select-Object ProcessName, Id, SessionId

Watch it:               Get-Content $AgentDir\agent.log -Wait -Tail 20
"@
