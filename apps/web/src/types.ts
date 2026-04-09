// Type definitions for frontend
export interface User {
  id: number;
  github_id: number;
  github_login: string;
  github_access_token?: string;
  role: 'admin' | 'deployer' | 'viewer';
  created_at: string;
}

export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  private: boolean;
  root_path: string;
  deploy_mode: 'release' | 'commit';
  watch_branch: string;
  enabled: boolean;
  added_by: number | null;
  created_at: string;
  last_deployed_ref?: string;
  last_deployed_ref_type?: string;
  last_deployment_status?: string;
  last_tunnel_url?: string;
}

export interface Deployment {
  id: number;
  repo_id: number;
  triggered_by: number | null;
  ref: string;
  ref_type: 'release' | 'commit';
  status: 'pending' | 'building' | 'running' | 'failed' | 'rolled_back';
  container_id: string | null;
  tunnel_url: string | null;
  tunnel_port: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  repo_name?: string;
  repo_full_name?: string;
  triggered_by_login?: string | null;
}

export interface Log {
  id: number;
  deployment_id: number | null;
  repo_id: number | null;
  category: 'build' | 'network' | 'system' | 'docker';
  level: 'info' | 'warn' | 'error';
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface Stats {
  total_repos: number;
  active_deployments: number;
  failed_today: number;
  tunnels_online: number;
}

export interface SystemStatus {
  database: 'connected' | 'disconnected';
  localtonet: 'installed' | 'not_installed';
  docker: 'running' | 'not_running';
}

export interface Settings {
  poll_interval_seconds: number;
}
