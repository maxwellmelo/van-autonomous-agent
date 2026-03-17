#Requires -Version 5.1
<#
.SYNOPSIS
    Van Setup Script for Windows
.DESCRIPTION
    Installs the Van agent, registers shared cognitive methodology skills,
    configures lossless-claw, creates start/stop convenience scripts,
    and runs a smoke test to verify everything works.
.EXAMPLE
    cd $env:USERPROFILE\.openclaw\agents-workspaces\van
    .\setup.ps1
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

$SkillDir      = Join-Path $env:USERPROFILE '.openclaw' 'skills' 'van'
$WorkspaceDir  = $PSScriptRoot
$OpenClawConfig = Join-Path $env:USERPROFILE '.openclaw' 'openclaw.json'
$AgentName     = 'van'

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

function Write-Info    { param([string]$Msg) Write-Host "[INFO]  $Msg" -ForegroundColor Cyan }
function Write-Success { param([string]$Msg) Write-Host "[OK]    $Msg" -ForegroundColor Green }
function Write-Warn    { param([string]$Msg) Write-Host "[WARN]  $Msg" -ForegroundColor Yellow }
function Write-Fail    { param([string]$Msg) Write-Host "[ERROR] $Msg" -ForegroundColor Red }

function Assert-Command {
    param([string]$Command, [string]$InstallHint)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Fail "$Command is required but not found. $InstallHint"
        exit 1
    }
}

# ---------------------------------------------------------------------------
# Step 1: Prerequisite checks
# ---------------------------------------------------------------------------

function Test-Prerequisites {
    Write-Info 'Checking prerequisites...'

    Assert-Command 'node'      'Install Node.js 20+ from https://nodejs.org/'
    Assert-Command 'npm'       'npm ships with Node.js — reinstall Node.js.'
    Assert-Command 'openclaw'  'Install OpenClaw from https://openclaw.dev/docs/install'

    $nodeVersion = (node --version) -replace 'v', ''
    $nodeMajor   = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt 20) {
        Write-Fail "Node.js 20+ is required. Current version: v$nodeVersion"
        exit 1
    }

    Write-Success "All prerequisites satisfied (Node.js v$nodeVersion)."
}

# ---------------------------------------------------------------------------
# Step 2: Clean build
# ---------------------------------------------------------------------------

function Invoke-Build {
    Write-Info 'Installing npm dependencies...'
    Set-Location $WorkspaceDir
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'npm install failed. Check your network connection and try again.'
        exit 1
    }
    Write-Success 'Dependencies installed.'

    Write-Info 'Building TypeScript (clean build)...'
    if (Test-Path (Join-Path $WorkspaceDir 'dist')) {
        Remove-Item -Recurse -Force (Join-Path $WorkspaceDir 'dist')
    }
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Build failed. Check the TypeScript errors above.'
        exit 1
    }
    Write-Success 'Build complete — dist/ is fresh.'
}

# ---------------------------------------------------------------------------
# Step 3: Create memory directory structure
# ---------------------------------------------------------------------------

function New-MemoryStructure {
    Write-Info 'Creating memory directory structure...'

    $Dirs = @(
        'memory\identity',
        'memory\goals',
        'memory\experiences\successes',
        'memory\experiences\failures',
        'memory\experiences\insights',
        'memory\knowledge\technical',
        'memory\knowledge\markets',
        'memory\knowledge\domains',
        'memory\knowledge\tools',
        'memory\knowledge\mental-models',
        'memory\revenue',
        'memory\evolution',
        'memory\world-model',
        'memory\system\session-logs',
        'memory\system\session-handoffs',
        'memory\system\monthly-reflections',
        'memory\system\plans',
        'memory\system\diagnostics',
        'logs'
    )

    foreach ($dir in $Dirs) {
        $fullPath = Join-Path $WorkspaceDir $dir
        New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
    }

    Write-Success 'Memory directories created.'
}

# ---------------------------------------------------------------------------
# Step 4: Install shared methodology skills
# ---------------------------------------------------------------------------

function Install-Skills {
    Write-Info 'Installing shared cognitive methodology skills...'

    New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null
    Copy-Item -Path (Join-Path $WorkspaceDir 'SKILL.md') -Destination (Join-Path $SkillDir 'SKILL.md') -Force

    $Skills = @(
        'cognitive-loop', 'goal-manager', 'reflection', 'risk-assessor',
        'self-evolution', 'revenue-strategist', 'action-planner',
        'memory-manager', 'core-identity', 'world-model'
    )

    $installed = 0
    foreach ($skill in $Skills) {
        $src = Join-Path $WorkspaceDir 'methodology' 'skills' $skill 'SKILL.md'
        $destDir = Join-Path $SkillDir $skill

        if (-not (Test-Path $src)) {
            Write-Warn "Skill file not found: $src -- skipping"
            continue
        }

        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -Path $src -Destination (Join-Path $destDir 'SKILL.md') -Force
        $installed++
    }

    Write-Success "Installed $installed/10 cognitive skills to $SkillDir"
}

# ---------------------------------------------------------------------------
# Step 5: Register the Van agent
# ---------------------------------------------------------------------------

function Register-VanAgent {
    Write-Info 'Registering Van agent with OpenClaw...'

    $existingAgents = & openclaw agents list 2>$null
    if ($existingAgents -match "^$AgentName\b") {
        Write-Warn "Agent '$AgentName' is already registered. Skipping."
        return
    }

    openclaw agents add $AgentName --workspace $WorkspaceDir
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Failed to register agent. Ensure the OpenClaw gateway is running: openclaw gateway status'
        exit 1
    }
    Write-Success "Agent '$AgentName' registered."
}

# ---------------------------------------------------------------------------
# Step 6: Configure lossless-claw
# ---------------------------------------------------------------------------

function Set-LosslessClaw {
    Write-Info 'Checking lossless-claw plugin configuration...'

    if (-not (Test-Path $OpenClawConfig)) {
        Write-Warn "openclaw.json not found — skipping lossless-claw config."
        Write-Warn "If you installed lossless-claw, add it manually to plugins.allow."
        return
    }

    $configContent = Get-Content $OpenClawConfig -Raw
    if ($configContent -match 'lossless-claw') {
        Write-Success 'lossless-claw already in openclaw.json.'
    } else {
        Write-Warn 'lossless-claw not found in openclaw.json.'
        Write-Warn "Add `"lossless-claw`" to plugins.allow in $OpenClawConfig"
        Write-Warn 'Then restart: openclaw gateway restart'
    }
}

# ---------------------------------------------------------------------------
# Step 7: Create convenience scripts
# ---------------------------------------------------------------------------

function New-ConvenienceScripts {
    Write-Info 'Creating start/stop convenience scripts...'

    # van-start.ps1
    @"
# Start Van autonomous agent in background
`$dir = Split-Path -Parent `$MyInvocation.MyCommand.Path
Set-Location `$dir

if ((Test-Path van.pid) -and (Get-Process -Id (Get-Content van.pid) -ErrorAction SilentlyContinue)) {
    Write-Host "Van is already running (PID `$(Get-Content van.pid)). Use .\van-stop.ps1 first."
    exit 1
}

New-Item -ItemType Directory -Force -Path logs | Out-Null
`$proc = Start-Process -FilePath 'node' -ArgumentList 'dist/index.js' -WorkingDirectory `$dir -RedirectStandardOutput 'logs\van.log' -RedirectStandardError 'logs\van-error.log' -PassThru -WindowStyle Hidden
`$proc.Id | Out-File van.pid -Encoding ascii
Write-Host "Van started (PID `$(`$proc.Id)). Logs: `$dir\logs\van.log"
Write-Host "Monitor: Get-Content `$dir\logs\van.log -Tail 20 -Wait"
Write-Host "Stop:    `$dir\van-stop.ps1"
"@ | Out-File (Join-Path $WorkspaceDir 'van-start.ps1') -Encoding utf8

    # van-stop.ps1
    @"
# Stop the Van autonomous agent
`$dir = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$pidFile = Join-Path `$dir 'van.pid'

if (-not (Test-Path `$pidFile)) {
    Write-Host 'No van.pid file found — Van may not be running.'
    exit 0
}

`$pid = Get-Content `$pidFile
try {
    Stop-Process -Id `$pid -Force
    Write-Host "Van stopped (PID `$pid)."
} catch {
    Write-Host "Process `$pid not found — Van was not running."
}
Remove-Item `$pidFile -Force -ErrorAction SilentlyContinue
"@ | Out-File (Join-Path $WorkspaceDir 'van-stop.ps1') -Encoding utf8

    # van-status.ps1
    @"
# Check Van status
`$dir = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$pidFile = Join-Path `$dir 'van.pid'

if ((Test-Path `$pidFile) -and (Get-Process -Id (Get-Content `$pidFile) -ErrorAction SilentlyContinue)) {
    `$pid = Get-Content `$pidFile
    Write-Host "Van is running (PID `$pid)"
    Write-Host ""
    Write-Host "Last 10 log lines:"
    Get-Content (Join-Path `$dir 'logs\van.log') -Tail 10 -ErrorAction SilentlyContinue
    Write-Host ""
    `$goalsFile = Join-Path `$dir 'memory\goals\active.md'
    if (Test-Path `$goalsFile) {
        Write-Host "Active goals:"
        Select-String -Path `$goalsFile -Pattern '^### ' | ForEach-Object { `$_.Line }
    }
} else {
    Write-Host 'Van is not running.'
    Write-Host "Start with: `$dir\van-start.ps1"
}
"@ | Out-File (Join-Path $WorkspaceDir 'van-status.ps1') -Encoding utf8

    Write-Success 'Created van-start.ps1, van-stop.ps1, van-status.ps1'
}

# ---------------------------------------------------------------------------
# Step 8: Smoke test
# ---------------------------------------------------------------------------

function Invoke-SmokeTest {
    Write-Info 'Running smoke test (1 cognitive cycle)...'
    Set-Location $WorkspaceDir

    $env:MAX_CYCLES = '1'
    try {
        $output = & node dist/index.js 2>&1 | Out-String
    } catch {
        $output = $_.Exception.Message
    }
    Remove-Item Env:\MAX_CYCLES -ErrorAction SilentlyContinue

    if ($output -match 'CYCLE 1 COMPLETE') {
        Write-Success 'Smoke test passed — first cognitive cycle completed successfully.'
    } elseif ($output -match 'CYCLE 1') {
        Write-Warn 'Smoke test: cycle 1 started but may not have completed cleanly.'
        Write-Warn 'This is usually fine — Van will recover on the next start.'
    } else {
        Write-Warn 'Smoke test: unexpected output. Van may still work — check logs after starting.'
        Write-Host 'Output preview:'
        $output.Split("`n") | Select-Object -Last 5 | ForEach-Object { Write-Host $_ }
    }
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function Main {
    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Magenta
    Write-Host ' Van — Autonomous Cognitive Framework Setup' -ForegroundColor Magenta
    Write-Host '=================================================================' -ForegroundColor Magenta
    Write-Host ''

    Test-Prerequisites;  Write-Host ''
    Invoke-Build;        Write-Host ''
    New-MemoryStructure; Write-Host ''
    Install-Skills;      Write-Host ''
    Register-VanAgent;   Write-Host ''
    Set-LosslessClaw;    Write-Host ''
    New-ConvenienceScripts; Write-Host ''
    Invoke-SmokeTest;    Write-Host ''

    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host ' Setup complete.' -ForegroundColor Green
    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host "Start Van:    $WorkspaceDir\van-start.ps1"
    Write-Host "Stop Van:     $WorkspaceDir\van-stop.ps1"
    Write-Host "Check status: $WorkspaceDir\van-status.ps1"
    Write-Host "Monitor logs: Get-Content $WorkspaceDir\logs\van.log -Tail 20 -Wait"
    Write-Host ''
    Write-Host 'Use cognitive skills in other agents:'
    Write-Host '  Add to any agent config:'
    Write-Host '    skills:'
    Write-Host '      - van/cognitive-loop'
    Write-Host '      - van/goal-manager'
    Write-Host '      - van/reflection'
    Write-Host ''
}

Main
