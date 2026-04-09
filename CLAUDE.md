# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

togit-deployer is a self-hosted GitHub auto-deployment platform. It monitors GitHub repositories, builds Docker images, and exposes them through Localtonet reverse tunnels. Built with **Bun**, **React**, **PostgreSQL**, and **Docker**.

## Development Commands

```bash
# Development (hot reload for both server and frontend)
bun run dev

# Database migrations (also run automatically on server startup)
bun run migrate

# Build frontend for production
bun run build

# Start production server (requires frontend to be built first)
bun run start

# Lint all TypeScript/TSX files
bun run lint
```

### Database Setup

```bash
# Start PostgreSQL via Docker
docker compose up -d postgres

# Or on Fedora/Linux (native installation)
sudo systemctl start postgresql
```

### Production Deployment

Use `start.sh` to build frontend and start both backend and Vite preview server.

## Architecture

### High-Level Flow

```
GitHub Repository Added (via Web UI)
        ↓
Scheduler polls GitHub API every N seconds (configurable)
        ↓
New release/commit detected
        ↓
Clone repo → Build Docker image → Stop old container
        ↓
Start container with port mapping → Create/reuse Localtonet tunnel
        ↓
On failure: Rollback to last known-good deployment
```

### Key Components

#### 1. **Scheduler** (`apps/server/src/daemon/scheduler.ts`)
- Polls all enabled repositories at configurable intervals (default: 60s)
- Compares latest GitHub ref (release tag or commit SHA) with last deployed ref
- Prevents concurrent deployments for the same repo using `activeDeploys` lock
- Triggers deployment via `deploy()` when update detected

#### 2. **Deployer** (`apps/server/src/daemon/deployer.ts`)
- **Clone**: Uses `git clone --depth=1 --branch <ref>` with optional access token for private repos
- **Build**: Spawns `docker build` CLI command (NOT Dockerode API) for better log streaming
- **Port Management**:
  - Parses Dockerfile EXPOSE directive to auto-detect container port
  - Auto-configures `container_port` if default (3000) differs from EXPOSE
  - Assigns persistent `tunnel_port` from 10000+ for stable host port mapping
  - Injects `PORT` environment variable for runtime configuration
- **Run**: Uses `docker run` CLI with `-p <tunnel_port>:<container_port>`
- **Health Check**: TCP socket connection test on host port (30 attempts @ 1s intervals)
- **Cleanup**: Removes build artifacts, prunes old images, handles interrupted deploys on startup

**Important**: Uses plain Docker CLI commands (`spawn('docker', [...])`) instead of Dockerode for build/run operations to get real-time log output.

#### 3. **Tunnel Manager** (`apps/server/src/daemon/localtonet.ts`)
- Creates persistent tunnels stored in `repositories.localtonet_tunnel_id`
- Supports three modes:
  - `random`: Auto-generated subdomain
  - `subdomain`: Custom subdomain under localto.net
  - `custom-domain`: User's own domain
- Reuses tunnel across redeployments (only updates port mapping)
- Provides "Reset Tunnel" API to recreate tunnel with new URL

#### 4. **Rollback System** (`apps/server/src/daemon/rollback.ts`)
- Automatically triggers on deployment failure
- Finds last successful deployment (`status = 'running'`) for the repo
- Guards against infinite rollback loops via `rollbackingRepos` Set
- Deploys previous ref using same flow as new deployment

#### 5. **Logger** (`apps/server/src/logger/index.ts`)
- Four categories: `build`, `docker`, `network`, `system`
- Stores all logs in PostgreSQL `logs` table
- Broadcasts real-time logs over WebSocket (`ws://host:port/ws/logs?deploymentId=<id>`)
- Maintains in-memory subscriber map for per-deployment and global log streams

#### 6. **Authentication** (`apps/server/src/github/oauth.ts`)
- GitHub OAuth flow with PKCE-like state verification
- Session-based auth using encrypted cookies
- Access levels: `pending` → `approved` | `blocked` | `banned`
- Token encryption using AES-256-CBC with `SESSION_SECRET` as key
- First user to sign in automatically becomes admin

### Database Schema

#### Core Tables
- **users**: GitHub OAuth users with role (`admin`, `deployer`, `viewer`) and `access_level`
- **repositories**: GitHub repos with `deploy_mode` (release/commit), `watch_branch`, tunnel config
- **deployments**: Build/run history with status tracking and env vars
- **logs**: Structured logs linked to deployments/repos
- **user_repo_permissions**: Granular per-repo access control

#### Key Columns
- `repositories.container_port`: Port app listens on inside container (default: 3000, auto-detected from Dockerfile EXPOSE)
- `repositories.tunnel_port`: Fixed host port for Docker `-p` mapping (auto-assigned from 10000+)
- `repositories.localtonet_tunnel_id`: Persistent tunnel ID reused across deploys
- `repositories.service_name`: Logical service name for monorepo support (allows same repo with different services)
- `deployments.env_vars`: Per-deployment environment variables (merged with repo-level vars)

### Port Mismatch Detection

**Problem**: User's Dockerfile has `EXPOSE 8080` but database has default `container_port=3000`, causing health check failures.

**Solution** (`apps/server/src/daemon/dockerfile-parser.ts`):
- Parses Dockerfile EXPOSE directive before build
- Auto-updates `container_port` when using default and Dockerfile differs
- Warns when manual `container_port` conflicts with EXPOSE
- Enhanced error messages on health check failures

### Monorepo Support

Multiple services from the same repository are supported via:
- `service_name` field (default: 'app')
- `root_path` field (default: '/')
- Unique constraint: `(full_name, service_name)`

This allows deploying `owner/repo` with service "backend" from `/services/api` and service "frontend" from `/services/web`.

## API Architecture

All routes defined in `apps/server/src/index.ts` using custom `matchRoute()` pattern matcher.

**Authentication Middleware**: `requireAuth()` extracts session from cookie, validates against PostgreSQL.

**WebSocket**: `/ws/logs?deploymentId=<id>` for real-time log streaming (handled by Bun's native WebSocket support).

## Important Patterns

### Deployment Lock
Prevents concurrent deploys for the same repo:
```typescript
const activeDeploys = new Map<number, boolean>();
if (activeDeploys.has(repoId)) return false;
```

### Rollback Loop Prevention
```typescript
const rollbackingRepos = new Set<number>();
if (rollbackingRepos.has(repo.id)) throw new Error('Loop detected');
```

### Migrations
- Run automatically on server startup via `runMigrations()`
- Files in `apps/server/src/db/migrations/` numbered sequentially (000-*.sql)
- Uses `_migrations` table to track applied migrations

### Environment Variables
Bun automatically loads `.env` files (no need for dotenv package).

### TypeScript Imports
Must use `.js` extension in imports (Bun/ESM requirement):
```typescript
import { query } from '../db/client.js'; // ✅
import { query } from '../db/client';    // ❌
```

### Git Workflow
**CRITICAL**: After implementing any fix or feature:
1. Test locally first (`bun run dev` or appropriate test command)
2. Verify the fix works as expected
3. Commit changes with descriptive message
4. Push to remote repository

**Never skip local testing before committing.** This prevents pushing broken code to production.

## Troubleshooting Notes

**Docker socket permission**: Server must be able to access `/var/run/docker.sock`. Add user to `docker` group or run with appropriate permissions.

**Localtonet not installed**: Server attempts auto-install on startup via `installLocaltonet()`. Manual install: `curl -fsSL https://localtonet.com/install.sh | sh`

**Health check failures**: Usually indicates port mismatch between `container_port` and actual app listening port. Check Dockerfile EXPOSE directive and deployment logs. Parser auto-detects this in recent versions.

**Cleanup on startup**: Server automatically cleans up interrupted builds, stale containers, and orphaned tunnels from previous crashes.

## Deployment Status States

- `pending`: Deployment created, not started
- `building`: Docker image building
- `running`: Container healthy and serving traffic
- `failed`: Build/health check failed
- `rolled_back`: Deployment replaced by rollback to previous version

**Note**: Only `pending` and `building` block new deployments. `running` status does NOT prevent scheduler from deploying updates.
