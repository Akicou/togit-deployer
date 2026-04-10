// Type definitions for frontend
export interface User {
  id: number;
  github_id: number;
  github_login: string;
  github_access_token?: string;
  role: 'admin' | 'deployer' | 'viewer';
  access_level: 'pending' | 'approved' | 'blocked' | 'banned';
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_by_login?: string;
  created_at: string;
  service_count?: number;
  active_tunnel_count?: number;
  has_access?: boolean;
  can_deploy?: boolean;
  access_request_pending?: boolean;
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
  project_id: number | null;
  deployment_env_vars: Record<string, string>;
  service_name: string;
  container_port: number;
  tunnel_port: number | null;
  tunnel_enabled?: boolean;
  tunnel_type?: 'random' | 'subdomain' | 'custom-domain';
  tunnel_subdomain?: string | null;
  tunnel_domain?: string | null;
  localtonet_tunnel_id?: string | null;
  tunnel_url?: string | null;
  created_at: string;
  last_deployed_ref?: string;
  last_deployed_ref_type?: string;
  last_deployment_status?: string;
  last_tunnel_url?: string;
  project_name?: string;
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
  env_vars: Record<string, string>;
  started_at: string;
  finished_at: string | null;
  repo_name?: string;
  repo_full_name?: string;
  triggered_by_login?: string | null;
  localtonet_tunnel_id?: string | null;
}

export interface ActiveTunnel {
  id: number;
  tunnel_id: string;
  deployment_id: number;
  repo_name: string;
  tunnel_url: string;
  tunnel_port: number;
  started_at: string;
}

export interface TunnelStatus {
  exists: boolean;
  isActive: boolean;
  url?: string;
  error?: string;
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
  github_pat_set?: boolean;
}

export interface AccessRequest {
  id: number;
  user_id: number;
  github_login: string;
  status: 'pending' | 'approved' | 'blocked' | 'banned';
  requested_at: string;
  processed_at: string | null;
  processed_by: number | null;
  note: string | null;
}
