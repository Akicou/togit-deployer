/**
 * GitHub Webhook handler.
 * Instead of relying solely on the polling scheduler, repos can register
 * webhook URLs pointing at POST /api/webhooks/github to trigger instant deployments.
 */
import { query } from '../db/client.js';
import { deploy, acquireDeployLock, releaseDeployLock } from '../daemon/deployer.js';
import { decryptAccessToken } from '../github/oauth.js';
import { logSystem, logError } from '../logger/index.js';
import type { Repository } from '../types.js';
import crypto from 'crypto';

interface GitHubWebhookPayload {
  action?: string;
  release?: {
    tag_name: string;
    target_commitish: string;
  };
  repository?: {
    full_name: string;
    name: string;
    owner: { login: string };
  };
  ref?: string; // e.g. "refs/heads/main"
  after?: string; // commit sha
}

/**
 * Validate GitHub webhook signature (HMAC-SHA256).
 * The secret should be set as GITHUB_WEBHOOK_SECRET in .env.
 */
function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // If no secret is configured, skip verification (not recommended for production)
    console.warn('⚠️  GITHUB_WEBHOOK_SECRET not set — webhook signatures not verified');
    return true;
  }

  if (!signature) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function handleGitHubWebhook(req: Request): Promise<Response> {
  const event = req.headers.get('X-GitHub-Event');
  const signature = req.headers.get('X-Hub-Signature-256');

  if (!event) {
    return Response.json({ error: 'Missing X-GitHub-Event header' }, { status: 400 });
  }

  const body = await req.text();

  // Verify signature
  if (!verifyWebhookSignature(body, signature)) {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: GitHubWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const repoFullName = payload.repository?.full_name;
  if (!repoFullName) {
    return Response.json({ error: 'Missing repository in payload' }, { status: 400 });
  }

  // Find the repo in our database
  const repoResult = await query<Repository>(
    'SELECT * FROM repositories WHERE full_name = $1 AND enabled = true',
    [repoFullName]
  );

  if (repoResult.rows.length === 0) {
    // Repo not tracked or disabled — respond 200 to avoid GitHub retries
    return Response.json({ skipped: true, reason: 'repository not found or disabled' });
  }

  const repo = repoResult.rows[0];
  let ref: string | null = null;
  let refType: 'release' | 'commit' | null = null;

  // Handle release events
  if (event === 'release' && payload.action === 'published' && payload.release) {
    if (repo.deploy_mode !== 'release') {
      return Response.json({ skipped: true, reason: 'repo tracks commits, not releases' });
    }
    // Check if release targets the watched branch
    if (repo.watch_branch && payload.release.target_commitish !== repo.watch_branch) {
      return Response.json({ skipped: true, reason: 'release does not target watched branch' });
    }
    ref = payload.release.tag_name;
    refType = 'release';
  }

  // Handle push events
  if (event === 'push' && payload.ref) {
    if (repo.deploy_mode !== 'commit') {
      return Response.json({ skipped: true, reason: 'repo tracks releases, not commits' });
    }
    // Check if push is to the watched branch
    const branchRef = `refs/heads/${repo.watch_branch}`;
    if (payload.ref !== branchRef) {
      return Response.json({ skipped: true, reason: 'push not to watched branch' });
    }
    ref = payload.after!;
    refType = 'commit';
  }

  if (!ref || !refType) {
    return Response.json({ skipped: true, reason: 'no relevant update detected' });
  }

  // Acquire deploy lock
  const hasLock = await acquireDeployLock(repo.id);
  if (!hasLock) {
    return Response.json({ skipped: true, reason: 'deployment already in progress' });
  }

  try {
    logSystem(`Webhook triggered deploy: ${repo.full_name} @ ${ref}`, { repo_id: repo.id });
    const repoEnvVars = typeof repo.deployment_env_vars === 'string'
      ? JSON.parse(repo.deployment_env_vars)
      : (repo.deployment_env_vars || {});

    await deploy(repo, ref, refType, null, repoEnvVars);
    return Response.json({ success: true, deployment: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`Webhook deploy failed: ${errorMessage}`, { repo_id: repo.id });
    return Response.json({ error: errorMessage }, { status: 500 });
  } finally {
    releaseDeployLock(repo.id);
  }
}
