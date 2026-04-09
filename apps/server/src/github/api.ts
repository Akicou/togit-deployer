import { decryptAccessToken } from './oauth.js';
import { query } from '../db/client.js';

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  zipball_url: string;
  tarball_url: string;
  target_commitish: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
  };
}

/**
 * Check if a GitHub API response contains rate limit headers
 * and log a warning if we're close to running out.
 */
function checkRateLimitHeaders(headers: Headers): void {
  const remaining = headers.get('X-RateLimit-Remaining');
  if (remaining !== null && parseInt(remaining, 10) < 50) {
    console.warn(
      `⚠️  GitHub API rate limit running low: ${remaining} requests remaining`
    );
  }
}

async function githubFetch(url: string, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'togit-deployer',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { headers });
  checkRateLimitHeaders(response.headers);
  return response;
}

export async function getLatestRelease(
  owner: string,
  repo: string,
  accessToken?: string,
  branch?: string
): Promise<GitHubRelease | null> {
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`,
      accessToken
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = (await response.json()) as GitHubRelease[];
    if (releases.length === 0) return null;

    if (branch) {
      return releases.find((r) => r.target_commitish === branch) ?? null;
    }

    return releases[0];
  } catch (error) {
    console.error('Failed to fetch latest release:', error);
    throw error;
  }
}

export async function getLatestCommit(
  owner: string,
  repo: string,
  accessToken?: string,
  branch?: string
): Promise<GitHubCommit | null> {
  const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';

  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1${branchParam}`,
      accessToken
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const commits = (await response.json()) as GitHubCommit[];
    return commits[0] || null;
  } catch (error) {
    console.error('Failed to fetch latest commit:', error);
    throw error;
  }
}

/**
 * Fetch all user repositories with pagination support (paginates through all results).
 */
export async function getUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const allRepos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await githubFetch(
      `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
      accessToken
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = (await response.json()) as GitHubRepo[];
    if (repos.length === 0) break;

    allRepos.push(...repos);

    // Check if there are more pages
    const links = response.headers.get('Link');
    if (!links || !links.includes('rel="next"')) {
      break;
    }

    page++;

    // Safety cap to avoid infinite loops
    if (page > 20) break;
  }

  return allRepos;
}

export async function getRepo(
  owner: string,
  repo: string,
  accessToken?: string
): Promise<GitHubRepo | null> {
  try {
    const response = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      accessToken
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return (await response.json()) as GitHubRepo;
  } catch (error) {
    console.error('Failed to fetch repo:', error);
    throw error;
  }
}

export async function getLastDeployedRef(repoId: number): Promise<{ ref: string; ref_type: string } | null> {
  const result = await query<{ ref: string; ref_type: string }>(
    `SELECT ref, ref_type FROM deployments 
     WHERE repo_id = $1 AND status = 'running'
     ORDER BY started_at DESC
     LIMIT 1`,
    [repoId]
  );

  return result.rows[0] || null;
}
