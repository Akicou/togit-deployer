// Type definitions for togit-deployer

export interface User {
  id: number;
  github_id: number;
  github_login: string;
  github_access_token: string | null;
  role: 'admin' | 'deployer' | 'viewer';
  created_at: Date;
}

export interface Repository {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  private: boolean;
  root_path: string;
  deploy_mode: 'release' | 'commit';
  enabled: boolean;
  added_by: number | null;
  created_at: Date;
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
  started_at: Date;
  finished_at: Date | null;
}

export interface Log {
  id: number;
  deployment_id: number | null;
  repo_id: number | null;
  category: 'build' | 'network' | 'system' | 'docker';
  level: 'info' | 'warn' | 'error';
  message: string;
  meta: Record<string, unknown> | null;
  created_at: Date;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: Date;
  created_at: Date;
}

export interface UserRepoPermission {
  user_id: number;
  repo_id: number;
  can_view: boolean;
  can_deploy: boolean;
}

export interface Settings {
  poll_interval_seconds: number;
  [key: string]: unknown;
}

export interface TunnelOptions {
  localPort: number;
  protocol: 'http' | 'tcp' | 'udp';
  authToken: string;
  deploymentId: number;
}

export interface WebSocketLogMessage {
  level: 'info' | 'warn' | 'error';
  category: 'build' | 'network' | 'system' | 'docker';
  message: string;
  created_at: string;
  deployment_id?: number;
}

// Extend Bun Request to include user
declare global {
  namespace App {
    interface Locals {
      user?: User;
      session?: Session;
    }
  }
}
