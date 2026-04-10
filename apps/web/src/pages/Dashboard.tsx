import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useRecentDeployments } from '../hooks/useDeployments';
import DeployBadge from '../components/DeployBadge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Separator } from '../components/ui/separator';
import { Rocket, LayoutGrid, AlertTriangle, Users, Database, Container, Globe } from 'lucide-react';
import type { User, Stats, SystemStatus, Project } from '../types';
import { cn } from '../lib/utils';

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const { deployments, loading: deploymentsLoading } = useRecentDeployments();
  const [stats, setStats] = useState<Stats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [projectHealth, setProjectHealth] = useState<Project[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [repos, setRepos] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
    loadSystemStatus();
    loadProjectHealth();
    loadPendingRequests();
    loadRepos();
    const interval = setInterval(() => { loadStats(); loadSystemStatus(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadRepos() {
    try {
      const r = await api.get('/api/repos');
      if (r.ok) { const d = await r.json(); setRepos(d.repos || []); }
    } catch {}
  }

  async function loadProjectHealth() {
    if (user.role !== 'admin' && user.role !== 'deployer') return;
    try {
      const r = await api.get('/api/projects');
      if (r.ok) { const d = await r.json(); setProjectHealth(d.projects || []); }
    } catch {}
  }

  async function loadPendingRequests() {
    if (user.role !== 'admin') return;
    try {
      const r = await api.get('/api/access-requests');
      if (r.ok) {
        const d = await r.json();
        setPendingRequests((d.access_requests || []).filter((r: any) => r.status === 'pending').length);
      }
    } catch {}
  }

  async function loadStats() {
    try {
      const r = await api.get('/api/stats');
      if (r.ok) { const d = await r.json(); setStats(d.stats); }
    } catch {}
  }

  async function loadSystemStatus() {
    try {
      const r = await api.get('/api/system/status');
      if (r.ok) { const d = await r.json(); setSystemStatus(d.status); }
    } catch {}
  }

  const statCards = [
    { label: 'Total Services', value: stats?.total_repos ?? 0,          link: '/repositories', icon: LayoutGrid },
    { label: 'Active',          value: stats?.active_deployments ?? 0,  link: undefined,       icon: Rocket },
    { label: 'Failed Today',    value: stats?.failed_today ?? 0,        link: '/logs',         icon: AlertTriangle },
    { label: 'Tunnels Online',  value: stats?.tunnels_online ?? 0,      link: undefined,       icon: Globe },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Welcome back, {user.github_login}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map(({ label, value, link, icon: Icon }) => (
          <Card
            key={label}
            className={cn('transition-colors', link && 'cursor-pointer hover:bg-muted/50')}
            onClick={() => link && (window.location.href = link)}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(user.role === 'admin' || user.role === 'deployer') && (
              <Button asChild size="sm">
                <Link to="/repositories"><Rocket className="w-4 h-4" />Deploy Service</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/repositories"><LayoutGrid className="w-4 h-4" />View Services</Link>
            </Button>
            {(user.role === 'admin' || user.role === 'deployer') && (stats?.failed_today ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild className="text-orange-600 border-orange-200 hover:bg-orange-50">
                <Link to="/logs"><AlertTriangle className="w-4 h-4" />{stats!.failed_today} Failed Today</Link>
              </Button>
            )}
            {user.role === 'admin' && pendingRequests > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings">
                  <Users className="w-4 h-4" />
                  Manage Access
                  <Badge variant="destructive" className="ml-1 text-xs">{pendingRequests}</Badge>
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Health */}
      {projectHealth.length > 0 && (user.role === 'admin' || user.role === 'deployer') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projectHealth.map((project) => {
                const projectRepos = repos.filter((r: any) => r.project_id === project.id);
                const hasFailed = projectRepos.some((r: any) => r.last_deployment_status === 'failed');
                const hasBuilding = projectRepos.some((r: any) => ['pending', 'building'].includes(r.last_deployment_status));
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className={cn('p-3 rounded-md border text-sm transition-colors hover:bg-muted/50 no-underline', hasFailed && 'border-orange-200 bg-orange-50/50')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{project.name}</span>
                      {hasBuilding && <Badge variant="secondary" className="text-xs">Deploying</Badge>}
                      {hasFailed && <Badge variant="warning" className="text-xs">Has failures</Badge>}
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">{project.service_count || 0} services</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent Deployments */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Recent Deployments</CardTitle>
            <Button variant="ghost" size="sm" className="shrink-0" asChild>
              <Link to="/repositories">View All →</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {deploymentsLoading ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Loading...</p>
            ) : deployments.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">No deployments yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deployments.slice(0, 10).map((deployment) => (
                      <TableRow key={deployment.id}>
                        <TableCell className="min-w-[180px]">
                          <Link to={`/repositories/${deployment.repo_id}`} className="font-medium hover:underline text-foreground">
                            {deployment.repo_full_name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {deployment.ref.substring(0, 8)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap"><DeployBadge status={deployment.status} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(deployment.started_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Docker',     icon: Container, ok: systemStatus?.docker === 'running' },
              { label: 'Database',   icon: Database,  ok: systemStatus?.database === 'connected' },
              { label: 'Localtonet', icon: Globe,     ok: systemStatus?.localtonet === 'installed' },
            ].map(({ label, icon: Icon, ok }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-md border">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <Badge variant={ok ? 'success' : 'outline'} className="text-xs">
                  {ok ? 'Online' : 'Offline'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
