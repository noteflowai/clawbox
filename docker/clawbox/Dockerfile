FROM lscr.io/linuxserver/webtop:debian-xfce

# Set HOME directory for all subsequent commands and container runtime
# This ensures OpenClaw and other tools find configs at /home/core/.openclaw
ENV HOME=/home/core

# Install chromium with sandbox and common development tools
# Also install xdotool and scrot for desktop automation (EdgeBox MCP)
# Install code execution dependencies (python3, r-base) for EdgeBox code execution tools
# Note: Java installation handled separately to work around dpkg issues
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium chromium-sandbox fonts-noto-cjk \
    nodejs ffmpeg \
    vim curl wget git htop jq tree zip tmux xclip \
    xdotool scrot \
    python3 python3-pip \
    r-base \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Try to install Java separately with --fix-broken to handle any dpkg issues
RUN apt-get update && \
    (apt-get install -y --no-install-recommends openjdk-17-jdk || \
     apt-get install -y --no-install-recommends openjdk-11-jdk || \
     echo "Java installation failed, code execution for Java will be disabled") && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Remove dockremap user that conflicts with UID 1000
RUN userdel dockremap 2>/dev/null || true && \
    groupdel dockremap 2>/dev/null || true

# Fix UID: linuxserver.io base image creates abc with UID 911, GID 1000.
# dockremap (now removed) occupied UID 1000. Change abc UID to 1000 so that
# all subsequent chown/COPY --chown write UID 1000 into image layers.
# At runtime, init-adduser with PUID=1000 becomes a no-op.
RUN usermod -u 1000 abc && \
    echo "[build] abc UID changed from 911 to 1000"

# Rename abc user and group to core, set home to /home/core
RUN groupmod -n core abc && \
    usermod -l core -c "Core" -d /home/core abc && \
    mkdir -p /home/core && \
    chown -R core:core /home/core && \
    find /config -group 1000 -exec chgrp core {} + 2>/dev/null || true && \
    find /config -user 1000 -exec chown core {} + 2>/dev/null || true && \
    echo "[build] Renamed abc user/group to core, home set to /home/core"

# Replace all references to 'abc' with 'core' and HOME=/config with HOME=/home/core in s6 scripts
RUN find /etc/s6-overlay -type f -exec sed -i 's/s6-setuidgid abc/s6-setuidgid core/g' {} + && \
    find /etc/s6-overlay -type f -exec sed -i 's/\babc\b/core/g' {} + && \
    find /etc/s6-overlay -type f -exec sed -i 's|HOME=/config|HOME=/home/core|g' {} + && \
    find /etc/s6-overlay -type f -exec sed -i 's|HOME=\"/config\"|HOME=\"/home/core\"|g' {} + && \
    find /etc/cont-init.d -type f -exec sed -i 's/s6-setuidgid abc/s6-setuidgid core/g' {} + 2>/dev/null || true && \
    find /etc/cont-init.d -type f -exec sed -i 's/\babc\b/core/g' {} + 2>/dev/null || true && \
    find /etc/cont-init.d -type f -exec sed -i 's|HOME=/config|HOME=/home/core|g' {} + 2>/dev/null || true && \
    find /etc/cont-init.d -type f -exec sed -i 's|HOME=\"/config\"|HOME=\"/home/core\"|g' {} + 2>/dev/null || true && \
    echo "[build] Updated s6 scripts to use core user and /home/core"

# Create init script to set HOME and link /config to /home/core
RUN mkdir -p /etc/s6-overlay/s6-rc.d/user/contents.d \
             /etc/s6-overlay/s6-rc.d/init-set-home \
             /etc/s6-overlay/scripts && \
    echo "oneshot" > /etc/s6-overlay/s6-rc.d/init-set-home/type && \
    echo "init-config-end" > /etc/s6-overlay/s6-rc.d/init-set-home/dependencies && \
    echo "/etc/s6-overlay/scripts/set-home.sh" > /etc/s6-overlay/s6-rc.d/init-set-home/up && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-set-home && \
    cat > /etc/s6-overlay/scripts/set-home.sh << 'EOF'
#!/command/with-contenv bash
echo "[init] Setting HOME=/home/core"
printf "/home/core" > /run/s6/container_environment/HOME

# Ensure /home/core ownership is correct (volume mounts may create dirs as root)
chown core:core /home/core
chown -R core:core /home/core/.config 2>/dev/null || true
chown -R core:core /home/core/Workspace 2>/dev/null || true

# Create essential directories if they don't exist (needed for Chromium, desktop, etc.)
mkdir -p /home/core/.cache/chromium /home/core/Desktop /home/core/.local/share
chown -R core:core /home/core/.cache /home/core/Desktop /home/core/.local

# Fix ownership for directories that may retain stale UID from image layers or volume mounts
chown -R core:core /home/core/.mcporter 2>/dev/null || true
chown -R core:core /home/core/.npm 2>/dev/null || true
chown -R core:core /home/core/Videos 2>/dev/null || true
chown -R core:core /home/core/Downloads 2>/dev/null || true

# Link config directories from /config to /home/core (only symlink if not exists)
for item in ssl .dbus .gnupg .XDG .Xresources .bashrc; do
    if [ -e "/config/$item" ] && [ ! -e "/home/core/$item" ]; then
        ln -sf "/config/$item" "/home/core/$item"
        chown -h core:core "/home/core/$item" 2>/dev/null || true
    fi
done

# Copy xfce4 config if .config exists but xfce4 doesn't (needed for desktop)
if [ -d "/home/core/.config" ] && [ ! -d "/home/core/.config/xfce4" ] && [ -d "/config/.config/xfce4" ]; then
    cp -r /config/.config/xfce4 /home/core/.config/
    chown -R core:core /home/core/.config/xfce4
fi

# Ensure PATH includes .local/bin
if ! grep -q '.local/bin' /home/core/.bashrc 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/core/.bashrc
fi

echo "[init] /home/core setup complete"
EOF
RUN chmod +x /etc/s6-overlay/scripts/set-home.sh

# Create directory structure and download sample video
RUN mkdir -p /home/core/Videos/camera \
             /home/core/Videos/Recordings/Desktop \
             /home/core/Downloads \
             /home/core/Workspace \
             /home/core/Workspace/opencode \
             /home/core/Workspace/claudecode \
             /home/core/Workspace/kiro \
             /home/core/.local/bin && \
    wget -q "https://dn720404.ca.archive.org/0/items/apple-think-different-jobs_202110/Apple_Think_Different_Jobs.ia.mp4" \
        -O "/home/core/Videos/camera/camera.mp4" && \
    chown -R core:core /home/core

# Create /device directory for fake media devices (world writable)
RUN mkdir -p /device && chmod 777 /device

# Create Chromium launcher script (as root, will chown later)
RUN cat > /home/core/.local/bin/chromium-launcher << 'EOF'
#!/bin/bash
# Chromium Launcher with Fake Camera/Microphone and CDP Support

CAMERA_VIDEO="/home/core/Videos/camera/camera.mp4"
FAKE_VIDEO="/device/Camera.y4m"
FAKE_AUDIO="/device/Microphone.wav"

CHROMIUM_FLAGS=(
  # Basic settings
  --no-first-run
  --disable-translate
  --remote-debugging-port=9222
  --remote-debugging-address=0.0.0.0
  --start-maximized

  # Keep browser alive after closing all windows (background mode)
  # - Process stays alive, CDP port 9222 remains active
  # - Cookies and localStorage persist
  --keep-alive-for-test

  # Auto-grant permissions (no prompts for camera, mic, etc.)
  # Note: --auto-accept-camera-and-microphone-capture is preferred over deprecated --use-fake-ui-for-media-stream
  --auto-accept-camera-and-microphone-capture
  --disable-notifications
  --disable-popup-blocking
  --disable-prompt-on-repost

  # Disable security restrictions for sandbox environment
  --disable-web-security
  --allow-running-insecure-content

  # Performance and stability for automation
  --disable-hang-monitor
  --disable-background-timer-throttling
  --disable-backgrounding-occluded-windows
  --disable-renderer-backgrounding
  --disable-ipc-flooding-protection
)

if [ -f "$CAMERA_VIDEO" ]; then
  echo "[chromium-launcher] Converting video for fake camera..."
  ffmpeg -y -i "$CAMERA_VIDEO" -pix_fmt yuv420p -s 640x480 -r 30 "$FAKE_VIDEO" 2>/dev/null && \
  ffmpeg -y -i "$CAMERA_VIDEO" -vn -acodec pcm_s16le -ar 48000 -ac 1 "$FAKE_AUDIO" 2>/dev/null

  if [ -f "$FAKE_VIDEO" ] && [ -f "$FAKE_AUDIO" ]; then
    CHROMIUM_FLAGS+=(
      --use-fake-device-for-media-stream
      --use-file-for-fake-video-capture="$FAKE_VIDEO"
      --use-file-for-fake-audio-capture="$FAKE_AUDIO"
    )
    echo "[chromium-launcher] Fake camera/microphone enabled"
  fi
fi

echo "[chromium-launcher] Starting with CDP on port 9222"
exec /usr/bin/chromium "${CHROMIUM_FLAGS[@]}" "$@"
EOF

RUN chmod +x /home/core/.local/bin/chromium-launcher && \
    chown -R core:core /home/core

# Create s6 service to auto-start chromium-launcher
RUN mkdir -p /etc/s6-overlay/s6-rc.d/svc-chromium \
             /etc/s6-overlay/s6-rc.d/user/contents.d && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/svc-chromium/type && \
    echo "svc-de" > /etc/s6-overlay/s6-rc.d/svc-chromium/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-chromium && \
    cat > /etc/s6-overlay/s6-rc.d/svc-chromium/run << 'EOF'
#!/command/with-contenv bash
# Wait for desktop to be ready
sleep 5

cd /home/core
export HOME=/home/core
export DISPLAY=:1

echo "[svc-chromium] Starting chromium-launcher..."
exec s6-setuidgid core /home/core/.local/bin/chromium-launcher
EOF
RUN chmod +x /etc/s6-overlay/s6-rc.d/svc-chromium/run

# Copy MCP server files and install dependencies
COPY --chown=core:core mcp /home/core/mcp
RUN cd /home/core/mcp/playwright-mcp && npm install && \
    chown -R core:core /home/core/mcp/playwright-mcp

# Patch playwright-mcp to use last page for new sessions
RUN cd /home/core/mcp && node patch-playwright-mcp.js && \
    chown -R core:core /home/core/mcp/playwright-mcp

# Create s6 service for playwright-mcp
RUN mkdir -p /etc/s6-overlay/s6-rc.d/svc-playwright-mcp && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/svc-playwright-mcp/type && \
    echo "svc-chromium" > /etc/s6-overlay/s6-rc.d/svc-playwright-mcp/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-playwright-mcp && \
    cat > /etc/s6-overlay/s6-rc.d/svc-playwright-mcp/run << 'EOF'
#!/command/with-contenv bash
# Wait for chromium CDP to be ready
echo "[svc-playwright-mcp] Waiting for Chromium CDP on 127.0.0.1:9222..."
while ! ss -tln | grep -q '127.0.0.1:9222'; do
    sleep 1
done

echo "[svc-playwright-mcp] Starting Playwright MCP server on port 8931..."
cd /home/core/mcp/playwright-mcp
exec s6-setuidgid core node node_modules/@playwright/mcp/cli.js \
    --cdp-endpoint http://127.0.0.1:9222 \
    --port 8931 \
    --host '::' \
    --allowed-hosts '*' \
    --no-sandbox
EOF
RUN chmod +x /etc/s6-overlay/s6-rc.d/svc-playwright-mcp/run

# Build google-search-mcp
RUN cd /home/core/mcp/google-search-mcp && npm install && npm run build && \
    chown -R core:core /home/core/mcp/google-search-mcp

# Create s6 service for google-search-mcp
RUN mkdir -p /etc/s6-overlay/s6-rc.d/svc-google-search-mcp && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/svc-google-search-mcp/type && \
    echo "svc-chromium" > /etc/s6-overlay/s6-rc.d/svc-google-search-mcp/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-google-search-mcp && \
    cat > /etc/s6-overlay/s6-rc.d/svc-google-search-mcp/run << 'EOF'
#!/command/with-contenv bash
# Wait for chromium CDP to be ready
echo "[svc-google-search-mcp] Waiting for Chromium CDP on 127.0.0.1:9222..."
while ! ss -tln | grep -q '127.0.0.1:9222'; do
    sleep 1
done

echo "[svc-google-search-mcp] Starting Google Search MCP server on port 8933..."
cd /home/core/mcp/google-search-mcp
exec s6-setuidgid core node dist/index.js
EOF
RUN chmod +x /etc/s6-overlay/s6-rc.d/svc-google-search-mcp/run

# Build sandbox-mcp (Desktop Automation)
RUN cd /home/core/mcp/sandbox-mcp && npm install && npm run build && \
    chown -R core:core /home/core/mcp/sandbox-mcp

# Create s6 service for sandbox-mcp
RUN mkdir -p /etc/s6-overlay/s6-rc.d/svc-sandbox-mcp && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/svc-sandbox-mcp/type && \
    echo "svc-de" > /etc/s6-overlay/s6-rc.d/svc-sandbox-mcp/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-sandbox-mcp && \
    cat > /etc/s6-overlay/s6-rc.d/svc-sandbox-mcp/run << 'EOF'
#!/command/with-contenv bash
# Wait for desktop to be ready
echo "[svc-sandbox-mcp] Waiting for desktop to be ready..."
sleep 10

cd /home/core
export HOME=/home/core
export DISPLAY=:1

echo "[svc-sandbox-mcp] Starting Sandbox MCP server on port 8888..."
cd /home/core/mcp/sandbox-mcp
exec s6-setuidgid core node dist/index.js
EOF
RUN chmod +x /etc/s6-overlay/s6-rc.d/svc-sandbox-mcp/run

# ============================================================
# OpenClaw Installation (AI Gateway with Matrix support)
# ============================================================

# Install pnpm globally for OpenClaw
RUN npm install -g pnpm@10 corepack && corepack enable && \
    chown -R core:core /home/core/.npm 2>/dev/null || true

# Clone OpenClaw official repository at pinned commit (multi-account matrix support landed in caf5d2dd7)
# Pinned to: a7929abad86159ca92cfd1bb45e0c4a27011d598 (2026-02-27, Discord: thread bindings idle + max-age lifecycle)
RUN git clone https://github.com/openclaw/openclaw.git /opt/openclaw && \
    git -C /opt/openclaw checkout a7929abad86159ca92cfd1bb45e0c4a27011d598 && \
    chown -R core:core /opt/openclaw

# Install OpenClaw dependencies and build (including Control UI)
WORKDIR /opt/openclaw
RUN pnpm install --frozen-lockfile && \
    OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build || true && \
    pnpm ui:build || true

# Create global symlink so 'openclaw' is available on PATH for all users
RUN ln -sf /opt/openclaw/openclaw.mjs /usr/local/bin/openclaw && \
    chmod +x /opt/openclaw/openclaw.mjs && \
    echo "[build] openclaw symlinked to /usr/local/bin/openclaw"

# Install Matrix Bot SDK dependency (required for Matrix channel)
RUN cd /opt/openclaw && pnpm add -w @vector-im/matrix-bot-sdk

# Install Matrix plugin from local extension
RUN cd /opt/openclaw && \
    node dist/index.js plugins install ./extensions/matrix || true

# Copy and install custom openclaw plugins (google-search via mcporter bridge)
COPY --chown=core:core openclaw-extensions/ /opt/openclaw/extensions/
RUN cd /opt/openclaw && \
    node dist/index.js plugins install ./extensions/google-search || true

# Install ClawHub skills (shared across agents)
RUN mkdir -p /home/core/.openclaw/skills && \
    cd /home/core/Workspace && \
    npx clawhub install tmux-agents --force || true && \
    chown -R core:core /home/core/.openclaw/skills /home/core/Workspace/skills 2>/dev/null || true && \
    chown -R core:core /home/core/.npm 2>/dev/null || true

# ============================================================
# Install CLI Agent Tools (OpenCode, ClaudeCode, Kiro CLI)
# ============================================================

# Install CLI agent tools globally (including mcporter for external MCP server management)
RUN npm install -g opencode-ai @anthropic-ai/claude-code kiro-cli clawhub mcporter && \
    chown -R core:core /home/core/.npm 2>/dev/null || true

# Pre-install memory-lancedb native dependencies (requires pnpm, has @lancedb/lancedb native addon)
RUN cd /opt/openclaw/extensions/memory-lancedb && pnpm install || true

# Create OpenClaw data directories and init directory
RUN mkdir -p /home/core/.openclaw/workspace \
             /home/core/.openclaw/credentials \
             /home/core/.openclaw/matrix \
             /config-init/openclaw && \
    chown -R core:core /home/core/.openclaw /config-init

# Write MCP server config for claude CLI backend
# This file is referenced by --mcp-config in agents.defaults.cliBackends.claude-cli.args
RUN cat > /home/core/.openclaw/claude-mcp.json << 'EOF'
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/sse",
          "transport": "sse"
        },
        "google": {
          "url": "http://localhost:8933/mcp",
          "transport": "http"
    }
  }
}
EOF
RUN chown core:core /home/core/.openclaw/claude-mcp.json

# Pre-register mcporter servers so openclaw plugins can call them via 'mcporter call'
# .mcporter dir is NOT volume-mounted so this persists across restarts
RUN mkdir -p /home/core/.mcporter && \
    cat > /home/core/.mcporter/mcporter.json << 'EOF'
{
  "mcpServers": {
    "google": {
      "baseUrl": "http://localhost:8933/mcp"
    },
    "playwright": {
      "baseUrl": "http://localhost:8931/mcp"
    }
  },
  "imports": []
}
EOF
RUN chown -R core:core /home/core/.mcporter

# Final ownership sweep: ensure ALL files under /home/core are owned by core (UID 1000).
# Previous build steps (npm install -g, pnpm install, npx, node plugins install, etc.)
# may have created or modified files in /home/core as root. This catches any stragglers.
RUN chown -R core:core /home/core

# Create s6 oneshot service to copy config from /config-init to actual location
# This allows runtime modification of config files
RUN mkdir -p /etc/s6-overlay/s6-rc.d/init-openclaw-config && \
    echo "oneshot" > /etc/s6-overlay/s6-rc.d/init-openclaw-config/type && \
    echo "init-config-end" > /etc/s6-overlay/s6-rc.d/init-openclaw-config/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-openclaw-config && \
    echo "/etc/s6-overlay/scripts/init-openclaw-config.sh" > /etc/s6-overlay/s6-rc.d/init-openclaw-config/up && \
    cat > /etc/s6-overlay/scripts/init-openclaw-config.sh << 'EOF'
#!/command/with-contenv bash
# Copy OpenClaw config from init directory to actual location
# Copy if config doesn't exist OR is empty/invalid (preserve valid runtime modifications)

CONFIG_DIR="/home/core/.openclaw"
INIT_DIR="/config-init/openclaw"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"
INIT_FILE="$INIT_DIR/openclaw.json"
echo "[init-openclaw-config] Initializing OpenClaw configuration..."

# Function to check if config file is valid (exists and has content)
is_valid_config() {
    [ -f "$1" ] && [ -s "$1" ]
}

# Copy config if init exists and target is missing/empty
if [ -f "$INIT_FILE" ]; then
    if ! is_valid_config "$CONFIG_FILE"; then
        echo "[init-openclaw-config] Copying openclaw.json from init directory..."
        cp "$INIT_FILE" "$CONFIG_FILE"
        chown core:core "$CONFIG_FILE"
        chmod 644 "$CONFIG_FILE"
    else
        echo "[init-openclaw-config] Valid config exists, preserving runtime modifications"
    fi
else
    echo "[init-openclaw-config] No init config found at $INIT_FILE"
fi

chown -R core:core "$CONFIG_DIR"
echo "[init-openclaw-config] Configuration initialization complete"
EOF
RUN chmod +x /etc/s6-overlay/scripts/init-openclaw-config.sh

# Create s6 oneshot service to register Selkies user token after svc-selkies starts
# Selkies Secure Mode (SELKIES_MASTER_TOKEN set) requires user tokens to be POSTed
# to the control API (:8083/tokens) before clients can authenticate via ?token=
RUN mkdir -p /etc/s6-overlay/s6-rc.d/init-selkies-token && \
    echo "oneshot" > /etc/s6-overlay/s6-rc.d/init-selkies-token/type && \
    echo "init-config-end" > /etc/s6-overlay/s6-rc.d/init-selkies-token/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-selkies-token && \
    echo "/etc/s6-overlay/scripts/init-selkies-token.sh" > /etc/s6-overlay/s6-rc.d/init-selkies-token/up && \
    cat > /etc/s6-overlay/scripts/init-selkies-token.sh << 'EOF'
#!/command/with-contenv bash
# Register user token in Selkies Secure Mode
# SELKIES_MASTER_TOKEN is the admin key used to call /tokens API
# The actual access token clients use in ?token= must be registered here

MASTER_TOKEN="${SELKIES_MASTER_TOKEN:-}"
if [ -z "$MASTER_TOKEN" ]; then
    echo "[init-selkies-token] SELKIES_MASTER_TOKEN not set, skipping token registration"
    exit 0
fi

echo "[init-selkies-token] Waiting for Selkies control API on port 8083..."
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:8083/ >/dev/null 2>&1 || \
       curl -sf http://127.0.0.1:8083/tokens -o /dev/null 2>&1; then
        break
    fi
    # Also accept 405 (Method Not Allowed) which means the server is up
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8083/tokens 2>/dev/null)
    if [ "$STATUS" = "405" ] || [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
        break
    fi
    sleep 1
done

echo "[init-selkies-token] Registering access token (controller role, slot 1)..."
PAYLOAD="{\"${MASTER_TOKEN}\":{\"role\":\"controller\",\"slot\":1}}"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://127.0.0.1:8083/tokens \
    -H "Authorization: Bearer ${MASTER_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

if [ "$RESPONSE" = "200" ]; then
    echo "[init-selkies-token] Token registered successfully. Access URL: ?token=${MASTER_TOKEN}"
else
    echo "[init-selkies-token] WARNING: Token registration returned HTTP $RESPONSE, retrying in background..."
    # Retry loop in background in case selkies isn't fully ready yet
    (
        for i in $(seq 1 30); do
            sleep 2
            R=$(curl -s -o /dev/null -w "%{http_code}" \
                -X POST http://127.0.0.1:8083/tokens \
                -H "Authorization: Bearer ${MASTER_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "$PAYLOAD")
            if [ "$R" = "200" ]; then
                echo "[init-selkies-token] Token registered on retry $i"
                break
            fi
        done
    ) &
fi
EOF
RUN chmod +x /etc/s6-overlay/scripts/init-selkies-token.sh

# Create s6 service for OpenClaw Gateway
# Depends on svc-chromium and init-openclaw-config
RUN mkdir -p /etc/s6-overlay/s6-rc.d/svc-openclaw && \
    echo "longrun" > /etc/s6-overlay/s6-rc.d/svc-openclaw/type && \
    printf "svc-chromium\ninit-openclaw-config" > /etc/s6-overlay/s6-rc.d/svc-openclaw/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/svc-openclaw && \
    cat > /etc/s6-overlay/s6-rc.d/svc-openclaw/run << 'EOF'
#!/command/with-contenv bash
# OpenClaw Gateway Service
# Waits for Chromium CDP to be ready before starting

cd /opt/openclaw
export HOME=/home/core
export NODE_ENV=production

# Wait for Chromium CDP to be ready
echo "[svc-openclaw] Waiting for Chromium CDP on 127.0.0.1:9222..."
while ! ss -tln | grep -q '127.0.0.1:9222'; do
    sleep 1
done
echo "[svc-openclaw] Chromium CDP is ready"

# Small additional delay for stability
sleep 2

echo "[svc-openclaw] Starting OpenClaw Gateway on port 18789..."
echo "[svc-openclaw] Browser control enabled via CDP at http://127.0.0.1:9222"

# Set gateway token from config or use default
export OPENCLAW_GATEWAY_TOKEN="todo-replace-your-openclaw-gateway-token"

exec s6-setuidgid core node dist/index.js gateway
EOF
RUN chmod +x /etc/s6-overlay/s6-rc.d/svc-openclaw/run

# Create s6 oneshot service to initialize Workspace config files after openclaw seeds the workspace.
# openclaw bootstraps /home/core/Workspace (templates + config/) on first gateway start (~10s in).
# This service waits for the seed to complete then:
#   1. Creates config/mcporter.json if missing
#   2. Appends mcporter usage notes to TOOLS.md if not already present
RUN mkdir -p /etc/s6-overlay/s6-rc.d/init-workspace-config && \
    echo "oneshot" > /etc/s6-overlay/s6-rc.d/init-workspace-config/type && \
    echo "svc-openclaw" > /etc/s6-overlay/s6-rc.d/init-workspace-config/dependencies && \
    touch /etc/s6-overlay/s6-rc.d/user/contents.d/init-workspace-config && \
    echo "/etc/s6-overlay/scripts/init-workspace-config.sh" > /etc/s6-overlay/s6-rc.d/init-workspace-config/up && \
    cat > /etc/s6-overlay/scripts/init-workspace-config.sh << 'SCRIPT'
#!/command/with-contenv bash
# Initialize Workspace config files after openclaw seeds the workspace directory.
# Runs as root (s6 context), writes files as core:core.

WORKSPACE="/home/core/Workspace"
MCP_CONFIG="$WORKSPACE/config/mcporter.json"
TOOLS_MD="$WORKSPACE/TOOLS.md"
TOOLS_MARKER="<!-- mcporter-section -->"

echo "[init-workspace-config] Waiting for openclaw to start (gateway port 18789)..."

# Wait up to 120s for openclaw gateway to be listening on port 18789
for i in $(seq 1 120); do
    if ss -tln 2>/dev/null | grep -q ':18789 ' || ss -tln 2>/dev/null | grep -q ':18789$'; then
        echo "[init-workspace-config] OpenClaw gateway ready (attempt $i)"
        break
    fi
    sleep 1
done

# Give openclaw a few extra seconds after port is up to finish workspace init
sleep 5

# ── 1. config/mcporter.json ──────────────────────────────────────────────────
mkdir -p "$WORKSPACE/config"
chown core:core "$WORKSPACE/config"

if [ ! -f "$MCP_CONFIG" ]; then
    echo "[init-workspace-config] Creating $MCP_CONFIG"
    cat > "$MCP_CONFIG" << 'JSON'
{
  "mcpServers": {
    "browser": {
      "baseUrl": "http://localhost:8931/mcp"
    },
    "google": {
      "baseUrl": "http://localhost:8933/mcp"
    }
  },
  "imports": []
}
JSON
    chown core:core "$MCP_CONFIG"
    chmod 644 "$MCP_CONFIG"
    echo "[init-workspace-config] config/mcporter.json created"
else
    echo "[init-workspace-config] config/mcporter.json already exists, skipping"
fi

# ── 2. TOOLS.md — create or append mcporter section ─────────────────────────
if ! grep -qF "$TOOLS_MARKER" "$TOOLS_MD" 2>/dev/null; then
    if [ -f "$TOOLS_MD" ]; then
        echo "[init-workspace-config] Appending mcporter section to TOOLS.md"
    else
        echo "[init-workspace-config] Creating TOOLS.md with mcporter section"
    fi
    cat >> "$TOOLS_MD" << 'MD'

<!-- mcporter-section -->
## MCP Tools (mcporter)

mcporter config is at `config/mcporter.json` and pre-registers two servers:

### browser — Playwright MCP (port 8931)

Control the shared Chromium browser via MCP tools (navigate, click, type, screenshot, etc.).

```bash
# List available browser tools
mcporter list browser --schema

# Navigate to a URL
mcporter call browser.browser_navigate url="https://example.com"

# Take a screenshot
mcporter call browser.browser_take_screenshot

# Click an element
mcporter call browser.browser_click element="Submit button" ref="<ref>"

# Type text
mcporter call browser.browser_type element="search box" ref="<ref>" text="hello"

# Get page snapshot (accessibility tree)
mcporter call browser.browser_snapshot
```

### google — Google Search MCP (port 8933)

Real-time Google search via the local google-search-mcp server.

```bash
# List available google tools
mcporter list google --schema

# Search Google
mcporter call google.google_search query="openclaw AI gateway" limit=5

# Search with language/region
mcporter call google.google_search query="天气预报" language="zh" region="cn" limit=3

# Get raw HTML search results
mcporter call google.google_search_html query="site:github.com openclaw"
```

### Usage Tips

```bash
# Use --config to point at the workspace mcporter config
mcporter --config /home/core/Workspace/config/mcporter.json list

# Or set as default by copying to ~/.mcporter/mcporter.json
cp /home/core/Workspace/config/mcporter.json ~/.mcporter/mcporter.json
```
MD
    chown core:core "$TOOLS_MD"
    echo "[init-workspace-config] TOOLS.md updated"
else
    echo "[init-workspace-config] TOOLS.md mcporter section already present, skipping"
fi

echo "[init-workspace-config] Done"
SCRIPT
RUN chmod +x /etc/s6-overlay/scripts/init-workspace-config.sh

# Reset working directory
WORKDIR /