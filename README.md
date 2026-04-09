# togit-deployer

> Self-hosted GitHub auto-deployment platform — monitors repos, builds Docker images, and exposes them publicly through Localtonet reverse tunnels.

Built with **Bun**, **React**, **PostgreSQL**, and **Docker**.

---

## Features

- **Auto-deploy** on new GitHub releases or commits
- **Docker-native** — clones, builds, and runs containers automatically
- **Live tunnels** via [Localtonet](https://localtonet.com) for instant public URLs
- **GitHub OAuth** for secure multi-user access with role-based permissions
- **Real-time log streaming** over WebSocket
- **Rollback support** — reverts to the last healthy deployment on failure
- **Configurable polling interval** per-instance

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Bun](https://bun.sh/) | Runtime & package manager |
| [Docker](https://docker.com/) | Must be running |
| [PostgreSQL](https://postgresql.org/) | Or use the included Compose file |
| [Localtonet](https://localtonet.com/) | Free account required for tunnels |

### Fedora setup

```bash
# PostgreSQL
sudo dnf install postgresql-server postgresql-contrib
sudo postgresql-setup --initdb --unit postgresql
sudo systemctl enable --now postgresql

# Docker
sudo dnf config-manager addrepo --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER
newgrp docker
```

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/your-org/togit-deployer
cd togit-deployer
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

```env
# GitHub OAuth — create at https://github.com/settings/applications/new
GITHUB_APP_CLIENT_ID=your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_APP_CALLBACK_URL=http://localhost:3000/api/auth/callback

# Localtonet — get token at https://localtonet.com/userApiTokens
LOCALTONET_AUTH_TOKEN=your_auth_token

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/togit

# App
PORT=3000
SESSION_SECRET=<random 32-char string>
NODE_ENV=development
```

### 3. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Run

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub. The first user to sign in automatically becomes admin.

---

## Project Structure

```
togit-deployer/
├── apps/
│   ├── server/src/
│   │   ├── api/          # REST route handlers
│   │   ├── daemon/       # Scheduler, deployer, tunnel manager, rollback
│   │   ├── db/           # PostgreSQL client & migrations
│   │   ├── github/       # OAuth flow & GitHub API helpers
│   │   └── logger/       # Structured logging + WebSocket broadcaster
│   └── web/src/
│       ├── components/   # Shared UI components
│       ├── hooks/        # React hooks (WebSocket, deployments)
│       ├── pages/        # Route-level views
│       └── lib/          # API client
├── docker-compose.yml
└── package.json
```

---

## Scripts

```bash
bun run dev        # Dev mode — server + frontend with hot reload
bun run build      # Build frontend for production
bun run migrate    # Run database migrations manually
```

Migrations also run automatically on every server startup.

### Production (with tunnel)

Use `start.sh` to build the frontend and start both the backend and the Vite preview server:

```bash
./start.sh
```

> **Note:** `docker compose` (no hyphen) is the correct command — `docker-compose` is the old standalone binary and is not installed.

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auth/github` | Start OAuth flow |
| `GET` | `/api/auth/callback` | OAuth callback |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Logout |

### Repositories

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos` | List repositories |
| `POST` | `/api/repos` | Add repository |
| `PATCH` | `/api/repos/:id` | Update settings |
| `DELETE` | `/api/repos/:id` | Remove repository |
| `POST` | `/api/repos/:id/deploy` | Trigger deployment manually |
| `GET` | `/api/repos/:id/deployments` | List deployments for repo |

### Deployments & Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/deployments/:id` | Deployment details |
| `GET` | `/api/logs` | Global log feed |
| `GET` | `/api/logs/stats` | System stats |
| `GET` | `/api/logs/status` | System health (DB, Docker, Localtonet) |

### Settings & Users (admin only)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Read settings |
| `PATCH` | `/api/settings` | Update settings |
| `GET` | `/api/users` | List users |
| `PATCH` | `/api/users/:id/role` | Change user role |

**WebSocket:** `ws://localhost:3000/ws/logs?deploymentId=<id>` — real-time log stream

---

## Deployment Modes

| Mode | Trigger |
|---|---|
| **release** | Deploys when a new GitHub release/tag is published |
| **commit** | Deploys on every new commit to the default branch |

---

## How It Works

```
GitHub repo added
      │
      ▼
Scheduler polls GitHub (configurable interval)
      │
      ▼ new release or commit detected
Clone repo → build Docker image → stop old container
      │
      ▼
Start new container → create Localtonet tunnel
      │
      ▼ on failure
Rollback to last known-good deployment
```

---

## Roles & Permissions

| Role | Can view | Can deploy | Can manage repos | Can manage users |
|---|---|---|---|---|
| `viewer` | ✓ (permitted repos) | — | — | — |
| `deployer` | ✓ | ✓ | ✓ | — |
| `admin` | ✓ | ✓ | ✓ | ✓ |

---

## Troubleshooting

**Docker daemon not running**
```
dial unix /var/run/docker.sock: connect: no such file or directory
```
```bash
sudo systemctl start docker
```

**Docker permission denied**
```
permission denied while trying to connect to the Docker daemon socket
```
```bash
sudo usermod -aG docker $USER
newgrp docker
```

**`docker-compose` command not found**
Use `docker compose` (space, no hyphen) — it is a built-in plugin in Docker CE v2+.

**Localtonet not installed**
The server will attempt to auto-install Localtonet on startup. To install manually:
```bash
curl -fsSL https://localtonet.com/install.sh | sh
```

**Database connection failed**
```bash
sudo systemctl start postgresql
docker compose up -d postgres
```

---

## License

MIT
