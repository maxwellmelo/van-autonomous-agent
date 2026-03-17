#Requires -Version 5.1
<#
.SYNOPSIS
    Van Setup Script for Windows
.DESCRIPTION
    Installs the Van agent and registers the shared cognitive methodology skills
    for all agents in your OpenClaw instance.
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

$SkillDir    = Join-Path $env:USERPROFILE '.openclaw' 'skills' 'van'
$WorkspaceDir = $PSScriptRoot
$AgentName   = 'van'

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
# Prerequisite checks
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

    Write-Success 'All prerequisites satisfied.'
}

# ---------------------------------------------------------------------------
# Step 1: Install npm dependencies and build
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

    Write-Info 'Building TypeScript project...'
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Build failed. Check the TypeScript errors above.'
        exit 1
    }
    Write-Success 'Build complete.'
}

# ---------------------------------------------------------------------------
# Step 2: Register the Van agent with OpenClaw
# ---------------------------------------------------------------------------

function Register-VanAgent {
    Write-Info 'Registering Van agent with OpenClaw...'

    # Check for existing registration
    $existingAgents = & openclaw agents list 2>$null
    if ($existingAgents -match "^$AgentName\b") {
        Write-Warn "Agent '$AgentName' is already registered. Skipping registration."
        return
    }

    openclaw agents add $AgentName --workspace $WorkspaceDir
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Failed to register agent. Ensure the OpenClaw daemon is running: openclaw status'
        exit 1
    }
    Write-Success "Agent '$AgentName' registered at $WorkspaceDir."
}

# ---------------------------------------------------------------------------
# Step 3: Install shared methodology skills
# ---------------------------------------------------------------------------

function Install-Skills {
    Write-Info 'Installing shared cognitive methodology skills...'

    # Create the top-level van skill directory
    New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null

    # Copy the root SKILL.md
    $rootSkill = Join-Path $WorkspaceDir 'SKILL.md'
    Copy-Item -Path $rootSkill -Destination (Join-Path $SkillDir 'SKILL.md') -Force
    Write-Success 'Installed van/SKILL.md'

    # Individual skill directories to install
    $Skills = @(
        'cognitive-loop',
        'goal-manager',
        'reflection',
        'risk-assessor',
        'self-evolution',
        'revenue-strategist',
        'action-planner',
        'memory-manager',
        'core-identity',
        'world-model'
    )

    foreach ($skill in $Skills) {
        $src  = Join-Path $WorkspaceDir 'methodology' 'skills' $skill 'SKILL.md'
        $destDir = Join-Path $SkillDir $skill
        $dest = Join-Path $destDir 'SKILL.md'

        if (-not (Test-Path $src)) {
            Write-Warn "Skill file not found: $src -- skipping"
            continue
        }

        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
        Copy-Item -Path $src -Destination $dest -Force
        Write-Success "Installed van/$skill"
    }
}

# ---------------------------------------------------------------------------
# Step 4: Create memory directory structure
# ---------------------------------------------------------------------------

function New-MemoryStructure {
    Write-Info 'Creating memory directory structure...'

    $Dirs = @(
        'memory/identity',
        'memory/goals',
        'memory/experiences/successes',
        'memory/experiences/failures',
        'memory/experiences/insights',
        'memory/experiences/interactions',
        'memory/knowledge/technical',
        'memory/knowledge/markets',
        'memory/knowledge/domains',
        'memory/knowledge/tools',
        'memory/knowledge/mental-models',
        'memory/revenue',
        'memory/evolution',
        'memory/world-model',
        'memory/system/session-logs',
        'memory/system/session-handoffs',
        'memory/system/monthly-reflections',
        'memory/system/plans',
        'memory/system/diagnostics',
        'logs'
    )

    foreach ($dir in $Dirs) {
        $fullPath = Join-Path $WorkspaceDir ($dir -replace '/', '\')
        New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
    }

    Write-Success 'Memory directories created.'
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function Main {
    Write-Host ''
    Write-Host '=================================================================' -ForegroundColor Magenta
    Write-Host ' Van -- Autonomous Cognitive Framework Setup' -ForegroundColor Magenta
    Write-Host '=================================================================' -ForegroundColor Magenta
    Write-Host ''

    Test-Prerequisites
    Write-Host ''

    Invoke-Build
    Write-Host ''

    New-MemoryStructure
    Write-Host ''

    Install-Skills
    Write-Host ''

    Register-VanAgent
    Write-Host ''

    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host ' Setup complete.' -ForegroundColor Green
    Write-Host '=================================================================' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Next steps:'
    Write-Host ''
    Write-Host '  1. Start the Van agent:'
    Write-Host '       openclaw agent start van'
    Write-Host ''
    Write-Host '  2. Use cognitive skills in your other agents:'
    Write-Host '       Add skill references to any agent config:'
    Write-Host '         skills:'
    Write-Host '           - van/cognitive-loop'
    Write-Host '           - van/goal-manager'
    Write-Host '           - van/reflection'
    Write-Host ''
    Write-Host "  3. Monitor Van:"
    Write-Host "       Get-Content $WorkspaceDir\memory\goals\active.md"
    Write-Host "       Get-Content $WorkspaceDir\logs\van.log -Wait"
    Write-Host ''
    Write-Host "Documentation: $WorkspaceDir\docs\setup.md"
    Write-Host ''
}

Main
