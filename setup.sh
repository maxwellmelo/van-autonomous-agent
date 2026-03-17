#!/usr/bin/env bash
# Van Setup Script
# Installs the Van agent, registers shared cognitive methodology skills,
# configures lossless-claw, creates start/stop convenience scripts,
# and runs a smoke test to verify everything works.
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
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"
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
# Step 1: Prerequisite checks
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

    success "All prerequisites satisfied (Node.js $(node --version), OpenClaw $(openclaw --version 2>/dev/null || echo 'detected'))."
}

# ---------------------------------------------------------------------------
# Step 2: Clean build
# ---------------------------------------------------------------------------

build_project() {
    info "Installing npm dependencies..."
    cd "${WORKSPACE_DIR}"
    npm install --silent \
        || die "npm install failed. Check your network connection and try again."
    success "Dependencies installed."

    info "Building TypeScript (clean build)..."
    rm -rf dist/
    npm run build \
        || die "Build failed. Check the TypeScript errors above."
    success "Build complete — dist/ is fresh."
}

# ---------------------------------------------------------------------------
# Step 3: Create memory directory structure
# ---------------------------------------------------------------------------

create_memory_structure() {
    info "Creating memory directory structure..."

    local dirs=(
        "memory/identity"
        "memory/goals"
        "memory/experiences/successes"
        "memory/experiences/failures"
        "memory/experiences/insights"
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
# Step 4: Install shared methodology skills
# ---------------------------------------------------------------------------

install_skills() {
    info "Installing shared cognitive methodology skills..."

    mkdir -p "${SKILL_DIR}"
    cp "${WORKSPACE_DIR}/SKILL.md" "${SKILL_DIR}/SKILL.md"

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

    local installed=0
    for skill in "${skills[@]}"; do
        local src="${WORKSPACE_DIR}/methodology/skills/${skill}/SKILL.md"
        if [ ! -f "${src}" ]; then
            warn "Skill file not found: ${src} — skipping"
            continue
        fi
        mkdir -p "${SKILL_DIR}/${skill}"
        cp "${src}" "${SKILL_DIR}/${skill}/SKILL.md"
        installed=$((installed + 1))
    done

    success "Installed ${installed}/10 cognitive skills to ${SKILL_DIR}"
}

# ---------------------------------------------------------------------------
# Step 5: Register the Van agent
# ---------------------------------------------------------------------------

register_agent() {
    info "Registering Van agent with OpenClaw..."

    if openclaw agents list 2>/dev/null | grep -q "^${AGENT_NAME}\b"; then
        warn "Agent '${AGENT_NAME}' is already registered. Skipping."
        return
    fi

    openclaw agents add "${AGENT_NAME}" --workspace "${WORKSPACE_DIR}" \
        || die "Failed to register agent. Ensure the OpenClaw gateway is running: openclaw gateway status"
    success "Agent '${AGENT_NAME}' registered."
}

# ---------------------------------------------------------------------------
# Step 6: Configure lossless-claw in plugins.allow
# ---------------------------------------------------------------------------

configure_lossless_claw() {
    info "Checking lossless-claw plugin configuration..."

    if [ ! -f "${OPENCLAW_CONFIG}" ]; then
        warn "openclaw.json not found at ${OPENCLAW_CONFIG} — skipping lossless-claw config."
        warn "If you installed lossless-claw, add it manually to plugins.allow in your openclaw.json."
        return
    fi

    if grep -q "lossless-claw" "${OPENCLAW_CONFIG}" 2>/dev/null; then
        success "lossless-claw already in openclaw.json."
    else
        warn "lossless-claw not found in openclaw.json."
        warn "To enable it, add \"lossless-claw\" to plugins.allow in ${OPENCLAW_CONFIG}"
        warn "Then restart the gateway: openclaw gateway restart"
    fi
}

# ---------------------------------------------------------------------------
# Step 7: Create convenience scripts (start/stop/status)
# ---------------------------------------------------------------------------

create_convenience_scripts() {
    info "Creating start/stop convenience scripts..."

    # van-start.sh
    cat > "${WORKSPACE_DIR}/van-start.sh" << 'SCRIPT'
#!/usr/bin/env bash
# Start Van autonomous agent in background
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${DIR}"

if [ -f van.pid ] && kill -0 "$(cat van.pid)" 2>/dev/null; then
    echo "Van is already running (PID $(cat van.pid)). Use ./van-stop.sh first."
    exit 1
fi

mkdir -p logs
nohup node dist/index.js > logs/van.log 2>&1 &
echo $! > van.pid
echo "Van started (PID $!). Logs: ${DIR}/logs/van.log"
echo "Monitor: tail -f ${DIR}/logs/van.log"
echo "Stop:    ${DIR}/van-stop.sh"
SCRIPT
    chmod +x "${WORKSPACE_DIR}/van-start.sh"

    # van-stop.sh
    cat > "${WORKSPACE_DIR}/van-stop.sh" << 'SCRIPT'
#!/usr/bin/env bash
# Stop the Van autonomous agent
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${DIR}/van.pid" ]; then
    echo "No van.pid file found — Van may not be running."
    exit 0
fi

PID=$(cat "${DIR}/van.pid")
if kill -0 "${PID}" 2>/dev/null; then
    kill "${PID}"
    echo "Van stopped (PID ${PID})."
else
    echo "Process ${PID} not found — Van was not running."
fi
rm -f "${DIR}/van.pid"
SCRIPT
    chmod +x "${WORKSPACE_DIR}/van-stop.sh"

    # van-status.sh
    cat > "${WORKSPACE_DIR}/van-status.sh" << 'SCRIPT'
#!/usr/bin/env bash
# Check Van status
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "${DIR}/van.pid" ] && kill -0 "$(cat "${DIR}/van.pid")" 2>/dev/null; then
    PID=$(cat "${DIR}/van.pid")
    echo "Van is running (PID ${PID})"
    echo ""
    echo "Last 10 log lines:"
    tail -10 "${DIR}/logs/van.log" 2>/dev/null || echo "(no logs yet)"
    echo ""
    if [ -f "${DIR}/memory/goals/active.md" ]; then
        echo "Active goals:"
        grep "^### " "${DIR}/memory/goals/active.md" 2>/dev/null || echo "(none yet)"
    fi
else
    echo "Van is not running."
    echo "Start with: ${DIR}/van-start.sh"
fi
SCRIPT
    chmod +x "${WORKSPACE_DIR}/van-status.sh"

    success "Created van-start.sh, van-stop.sh, van-status.sh"
}

# ---------------------------------------------------------------------------
# Step 8: Smoke test — run 1 cycle to verify everything works
# ---------------------------------------------------------------------------

smoke_test() {
    info "Running smoke test (1 cognitive cycle)..."
    cd "${WORKSPACE_DIR}"

    local output
    output=$(MAX_CYCLES=1 node dist/index.js 2>&1) || true

    if echo "${output}" | grep -q "CYCLE 1 COMPLETE"; then
        success "Smoke test passed — first cognitive cycle completed successfully."
    elif echo "${output}" | grep -q "CYCLE 1"; then
        warn "Smoke test: cycle 1 started but may not have completed cleanly."
        warn "This is usually fine — Van will recover on the next start."
    else
        warn "Smoke test: unexpected output. Van may still work — check logs after starting."
        echo "Output preview:"
        echo "${output}" | tail -5
    fi
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

    configure_lossless_claw
    printf '\n'

    create_convenience_scripts
    printf '\n'

    smoke_test
    printf '\n'

    printf '=================================================================\n'
    printf ' Setup complete.\n'
    printf '=================================================================\n'
    printf '\n'
    printf 'Start Van:\n'
    printf '  %s/van-start.sh\n' "${WORKSPACE_DIR}"
    printf '\n'
    printf 'Stop Van:\n'
    printf '  %s/van-stop.sh\n' "${WORKSPACE_DIR}"
    printf '\n'
    printf 'Check status:\n'
    printf '  %s/van-status.sh\n' "${WORKSPACE_DIR}"
    printf '\n'
    printf 'Monitor logs:\n'
    printf '  tail -f %s/logs/van.log\n' "${WORKSPACE_DIR}"
    printf '\n'
    printf 'Use cognitive skills in other agents:\n'
    printf '  Add to any agent config:\n'
    printf '    skills:\n'
    printf '      - van/cognitive-loop\n'
    printf '      - van/goal-manager\n'
    printf '      - van/reflection\n'
    printf '\n'
}

main "$@"
