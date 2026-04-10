# OpenClaw Deployment Runbook

This runbook is for deploying `Agent Fight Club` to a server and letting `OpenClaw` keep it running.

## Goal

The server should run four things reliably:

1. the web app
2. the fight-club runner
3. live-proof sync
4. Moltbook posting

## Expected Server State

- Ubuntu or Debian-like VPS
- `node` already installed
- `python3`, `git`, `curl` available
- outbound access to GitHub, Moltbook, and OKX
- if needed, a local proxy at `http://127.0.0.1:7890`

## Repository

```bash
git clone https://github.com/richard7463/xlayer-agent-fight-club.git
cd xlayer-agent-fight-club
npm install
```

## Environment File

Create `.env.local`:

```env
OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
OKX_DEMO_TRADING=false
OKX_AGENT_PROXY=http://127.0.0.1:7890

MOLTBOOK_API_KEY=...
MOLTBOOK_PROXY=http://127.0.0.1:7890
MOLTBOOK_SUBMOLT=buildx
MOLTBOOK_AGENT_USERNAME=agentfightclub

AGENT_ARENA_ENABLE_BACKGROUND_RUNNER=true
AGENT_ARENA_NODE_ROLE=runtime
AGENT_ARENA_RUNNER_TOKEN=replace-with-a-long-random-string
FIGHT_CLUB_ACTIVE_FIGHTERS=atr-breakout-engine,micro-mean-revert
FIGHT_CLUB_LIVE_TRADING=true
FIGHT_CLUB_LIVE_FIGHTER_CAPITAL_USD=
FIGHT_CLUB_MOLTBOOK_REPORTS=true
FIGHT_CLUB_MOLTBOOK_POST_INTERVAL_SEC=600
FIGHT_CLUB_REPO_URL=https://github.com/richard7463/xlayer-agent-fight-club
```

## Install OnchainOS CLI And Skills

```bash
npx skills add okx/onchainos-skills -y
curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
onchainos --version
```

## Login Agentic Wallet

```bash
export PATH="$HOME/.local/bin:$PATH"
set -a && source .env.local && set +a
export HTTPS_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890} HTTP_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890}

onchainos wallet status
onchainos wallet login <owner-email> --locale en-US
onchainos wallet verify <otp-code>
onchainos wallet balance
```

Expected wallet for this project:

- Agentic Wallet: `0xdbc8e35ea466f85d57c0cc1517a81199b8549f04`

## Build Check

```bash
source ~/.nvm/nvm.sh
npm run build
```

## Manual Runtime Commands

Run these from the repo root:

```bash
source ~/.nvm/nvm.sh
export PATH="$HOME/.local/bin:$PATH"
set -a && source .env.local && set +a
export HTTPS_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890} HTTP_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890}
```

Start the web app:

```bash
npm run start -- --hostname 0.0.0.0 --port 3000
```

Sync the latest onchain proof:

```bash
node scripts/sync-live-proof.mjs
```

Post a Moltbook live update:

```bash
python3 scripts/post_live_update.py
```

Trigger one server-side runner cycle through the app:

```bash
curl -X POST http://127.0.0.1:3000/api/fight-club/admin/tick \
  -H "Authorization: Bearer ${AGENT_ARENA_RUNNER_TOKEN}"
```

The `admin/tick` route requires:

- `AGENT_ARENA_NODE_ROLE=runtime`
- `AGENT_ARENA_RUNNER_TOKEN` set
- `Authorization: Bearer <AGENT_ARENA_RUNNER_TOKEN>`

## systemd Layout

Use one long-running service for the web app and one timer-driven service for runtime work.

### 1. Web App Service

`/etc/systemd/system/agent-fight-club-web.service`

```ini
[Unit]
Description=Agent Fight Club web app
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xlayer-agent-fight-club
Environment=HOME=/home/ubuntu
ExecStart=/bin/bash -lc 'source ~/.nvm/nvm.sh && set -a && source .env.local && set +a && npm run start -- --hostname 0.0.0.0 --port 3000'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 2. Runtime Tick Service

`/etc/systemd/system/agent-fight-club-runtime.service`

```ini
[Unit]
Description=Agent Fight Club runtime tick
After=network-online.target agent-fight-club-web.service
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/xlayer-agent-fight-club
Environment=HOME=/home/ubuntu
ExecStart=/bin/bash -lc 'source ~/.nvm/nvm.sh && export PATH="$HOME/.local/bin:$PATH" && set -a && source .env.local && set +a && export HTTPS_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890} HTTP_PROXY=${OKX_AGENT_PROXY:-http://127.0.0.1:7890} && curl -fsS -X POST http://127.0.0.1:3000/api/fight-club/admin/tick -H "Authorization: Bearer ${AGENT_ARENA_RUNNER_TOKEN}" && node scripts/sync-live-proof.mjs && python3 scripts/post_live_update.py'
```

### 3. Runtime Timer

`/etc/systemd/system/agent-fight-club-runtime.timer`

```ini
[Unit]
Description=Run Agent Fight Club runtime every 10 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
Unit=agent-fight-club-runtime.service

[Install]
WantedBy=timers.target
```

### 4. Enable

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now agent-fight-club-web.service
sudo systemctl enable --now agent-fight-club-runtime.timer
```

## What OpenClaw Should Verify

After deployment, OpenClaw should check:

```bash
systemctl status agent-fight-club-web.service --no-pager
systemctl status agent-fight-club-runtime.timer --no-pager
curl http://127.0.0.1:3000/fight-club
curl http://127.0.0.1:3000/api/fight-club
curl -X POST http://127.0.0.1:3000/api/fight-club/admin/tick -H "Authorization: Bearer <AGENT_ARENA_RUNNER_TOKEN>"
onchainos wallet status
onchainos wallet balance --force
```

It should also confirm:

1. `data/fight-club/live-proof.json` updates after each runtime cycle
2. `data/fight-club/runtime/*.json` contains recent runtime events
3. new Moltbook posts continue to appear under `u/agentfightclub`
4. both fighters have recent real swap tx hashes in the runtime files, not just stale simulation records

## OpenClaw Prompt

Give OpenClaw this instruction:

> Deploy `Agent Fight Club` from `https://github.com/richard7463/xlayer-agent-fight-club` onto this server. Use `.env.local` for the provided keys, install OnchainOS skills and CLI, verify Agentic Wallet login, build the app, run the web server with systemd, add a timer that calls `/api/fight-club/admin/tick`, `node scripts/sync-live-proof.mjs`, and `python3 scripts/post_live_update.py` every 10 minutes, then verify the app, wallet balance, and Moltbook posting are all working.

## Operational Notes

- `post_live_update.py` already handles Moltbook rate limiting with retry sleep.
- `sync-live-proof.mjs` writes onchain balances and tx hashes into `data/fight-club/live-proof.json`.
- The project currently has real X Layer swaps, but it still needs sustained cadence to compete with high-frequency agents.
