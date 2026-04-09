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

export async function getLatestRelease(
  owner: string,
  repo: string,
  accessToken?: string,
  branch?: string
): Promise<GitHubRelease | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'togit-deployer',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=20`, {
      headers,
    });

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
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'togit-deployer',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1${branchParam}`, {
      headers,
    });

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

export async function getUserRepos(accessToken: string): Promise<GitHubRepo[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'togit-deployer',
  };

  try {
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers,
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return (await response.json()) as GitHubRepo[];
  } catch (error) {
    console.error('Failed to fetch user repos:', error);
    throw error;
  }
}

export async function getRepo(
  owner: string,
  repo: string,
  accessToken?: string
): Promise<GitHubRepo | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'togit-deployer',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
    });

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
