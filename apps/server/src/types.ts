// Type definitions for togit-deployer

export interface User {
  id: number;
  github_id: number;
  github_login: string;
  github_access_token: string | null;
  role: 'admin' | 'deployer' | 'viewer';
  access_level: 'pending' | 'approved' | 'blocked' | 'banned';
  created_at: Date;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_by_login?: string;
  created_at: Date;
  // Joined fields
  service_count?: number;
  active_tunnel_count?: number;
  has_access?: boolean;
  can_deploy?: boolean;
  access_request_pending?: boolean;
  user_permissions?: ProjectPermission;
}

export interface ProjectAccessRequest {
  id: number;
  user_id: number;
  project_id: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: Date;
  processed_at: Date | null;
  processed_by: number | null;
  note: string | null;
  // Joined fields
  github_login?: string;
  project_name?: string;
}

export interface ProjectPermission {
  can_view: boolean;
  can_deploy: boolean;
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
  // JSONB column — node-postgres automatically parses JSONB to objects
  deployment_env_vars: Record<string, string> | string;
  /** Logical service name for monorepo support. Defaults to 'app'. */
  service_name: string;
  /** Port the app listens on inside the container. Default 3000. */
  container_port: number;
  /** Fixed host port assigned to this repo for tunnel routing. */
  tunnel_port: number | null;
  /** Whether tunnel is currently enabled for this service */
  tunnel_enabled: boolean;
  /** Tunnel URL mode: random subdomain, custom subdomain, or custom domain */
  tunnel_type: 'random' | 'subdomain' | 'custom-domain';
  /** Custom subdomain for subdomain mode (e.g. "myapp" → myapp.localto.net) */
  tunnel_subdomain: string | null;
  /** Base domain for subdomain mode, or full domain for custom-domain mode */
  tunnel_domain: string | null;
  created_at: Date;
}

export interface ServiceTunnel {
  id: number;
  repo_id: number;
  created_by: number | null;
  localtonet_tunnel_id: string;
  tunnel_url: string;
  tunnel_port: number;
  status: 'active' | 'inactive';
  created_at: Date;
  last_used_at: Date | null;
  stopped_at: Date | null;
  stop_reason: string | null;
  // Joined fields
  repo_name?: string;
  created_by_login?: string;
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
  localtonet_tunnel_id: string | null;
  error_message: string | null;
  env_vars: Record<string, string>;
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

export interface UserProjectPermission {
  user_id: number;
  project_id: number;
  can_view: boolean;
  can_deploy: boolean;
}

export interface Settings {
  poll_interval_seconds: number;
  max_tunnels_per_project?: number;
  max_tunnels_per_user?: number;
  [key: string]: unknown;
}

export interface AccessRequest {
  id: number;
  user_id: number;
  status: 'pending' | 'approved' | 'blocked' | 'banned';
  requested_at: Date;
  processed_at: Date | null;
  processed_by: number | null;
  note: string | null;
}

export interface UserWithAccessInfo extends User {
  access_request_status: 'pending' | 'approved' | 'blocked' | 'banned';
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

// Note: The App.Locals pattern is a Bun/Hono convention.
// Since this app uses a raw fetch() handler without a middleware framework,
// Locals are not populated. Authentication is handled via cookie extraction
// in requireAuth(). See utils/cookie.ts for cookie utilities.
