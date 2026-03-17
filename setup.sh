#!/usr/bin/env bash
# Van Setup Script
# Installs the Van agent and registers the shared cognitive methodology skills
# for all agents in your OpenClaw instance.
#
# Usage:
#   cd ~/.openclaw/agents-workspaces/van
#   chmod +x setup.sh
#   ./setup.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SKILL_DIR="${HOME}/.openclaw/skills/van"
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_NAME="van"

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

info()    { printf '\033[0;34m[INFO]\033[0m  %s\n' "$*"; }
success() { printf '\033[0;32m[OK]\033[0m    %s\n' "$*"; }
warn()    { printf '\033[0;33m[WARN]\033[0m  %s\n' "$*"; }
error()   { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*" >&2; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisite checks
# ---------------------------------------------------------------------------

check_prerequisites() {
    info "Checking prerequisites..."

    command -v node >/dev/null 2>&1 \
        || die "node is required but not found. Install Node.js 20+ from https://nodejs.org/"

    command -v npm >/dev/null 2>&1 \
        || die "npm is required but not found. It ships with Node.js."

    command -v openclaw >/dev/null 2>&1 \
        || die "openclaw is required but not found. Install OpenClaw from https://openclaw.dev/docs/install"

    local node_major
    node_major=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "${node_major}" -lt 20 ]; then
        die "Node.js 20+ is required. Current version: $(node --version)"
    fi

    success "All prerequisites satisfied."
}

# ---------------------------------------------------------------------------
# Step 1: Install npm dependencies and build
# ---------------------------------------------------------------------------

build_project() {
    info "Installing npm dependencies..."
    cd "${WORKSPACE_DIR}"
    npm install --silent \
        || die "npm install failed. Check your network connection and try again."
    success "Dependencies installed."

    info "Building TypeScript project..."
    npm run build \
        || die "Build failed. Check the TypeScript errors above."
    success "Build complete."
}

# ---------------------------------------------------------------------------
# Step 2: Register the Van agent with OpenClaw
# ---------------------------------------------------------------------------

register_agent() {
    info "Registering Van agent with OpenClaw..."

    # Check if the agent is already registered to avoid duplicate registration
    if openclaw agents list 2>/dev/null | grep -q "^${AGENT_NAME}\b"; then
        warn "Agent '${AGENT_NAME}' is already registered. Skipping registration."
        return
    fi

    openclaw agents add "${AGENT_NAME}" --workspace "${WORKSPACE_DIR}" \
        || die "Failed to register agent. Ensure the OpenClaw daemon is running: openclaw status"
    success "Agent '${AGENT_NAME}' registered at ${WORKSPACE_DIR}."
}

# ---------------------------------------------------------------------------
# Step 3: Install shared methodology skills
# ---------------------------------------------------------------------------

install_skills() {
    info "Installing shared cognitive methodology skills..."

    # Create the top-level van skill directory
    mkdir -p "${SKILL_DIR}"

    # Copy the root SKILL.md (the van skill manifest)
    cp "${WORKSPACE_DIR}/SKILL.md" "${SKILL_DIR}/SKILL.md"
    success "Installed van/SKILL.md"

    # Individual skill directories to install
    local skills=(
        "cognitive-loop"
        "goal-manager"
        "reflection"
        "risk-assessor"
        "self-evolution"
        "revenue-strategist"
        "action-planner"
        "memory-manager"
        "core-identity"
        "world-model"
    )

    for skill in "${skills[@]}"; do
        local src="${WORKSPACE_DIR}/methodology/skills/${skill}/SKILL.md"
        local dest="${SKILL_DIR}/${skill}/SKILL.md"

        if [ ! -f "${src}" ]; then
            warn "Skill file not found: ${src} — skipping"
            continue
        fi

        mkdir -p "${SKILL_DIR}/${skill}"
        cp "${src}" "${dest}"
        success "Installed van/${skill}"
    done
}

# ---------------------------------------------------------------------------
# Step 4: Create memory directory structure
# ---------------------------------------------------------------------------

create_memory_structure() {
    info "Creating memory directory structure..."

    local dirs=(
        "memory/identity"
        "memory/goals"
        "memory/experiences/successes"
        "memory/experiences/failures"
        "memory/experiences/insights"
        "memory/experiences/interactions"
        "memory/knowledge/technical"
        "memory/knowledge/markets"
        "memory/knowledge/domains"
        "memory/knowledge/tools"
        "memory/knowledge/mental-models"
        "memory/revenue"
        "memory/evolution"
        "memory/world-model"
        "memory/system/session-logs"
        "memory/system/session-handoffs"
        "memory/system/monthly-reflections"
        "memory/system/plans"
        "memory/system/diagnostics"
        "logs"
    )

    for dir in "${dirs[@]}"; do
        mkdir -p "${WORKSPACE_DIR}/${dir}"
    done

    success "Memory directories created."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    printf '\n'
    printf '=================================================================\n'
    printf ' Van — Autonomous Cognitive Framework Setup\n'
    printf '=================================================================\n'
    printf '\n'

    check_prerequisites
    printf '\n'

    build_project
    printf '\n'

    create_memory_structure
    printf '\n'

    install_skills
    printf '\n'

    register_agent
    printf '\n'

    printf '=================================================================\n'
    printf ' Setup complete.\n'
    printf '=================================================================\n'
    printf '\n'
    printf 'Next steps:\n'
    printf '\n'
    printf '  1. Start the Van agent:\n'
    printf '       openclaw agent start van\n'
    printf '\n'
    printf '  2. Use cognitive skills in your other agents:\n'
    printf '       Add skill references to any agent config:\n'
    printf '         skills:\n'
    printf '           - van/cognitive-loop\n'
    printf '           - van/goal-manager\n'
    printf '           - van/reflection\n'
    printf '\n'
    printf '  3. Monitor Van:\n'
    printf '       cat %s/memory/goals/active.md\n' "${WORKSPACE_DIR}"
    printf '       tail -f %s/logs/van.log\n' "${WORKSPACE_DIR}"
    printf '\n'
    printf 'Documentation: %s/docs/setup.md\n' "${WORKSPACE_DIR}"
    printf '\n'
}

main "$@"
