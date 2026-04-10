import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import LogViewer from '../components/LogViewer';
import DeployBadge from '../components/DeployBadge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { ArrowLeft, ExternalLink, Loader2, Radio } from 'lucide-react';
import type { Deployment, Log } from '../types';

export default function DeploymentDetail({ user }: { user: any }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const { logs: liveLogs, connected } = useWebSocket(parseInt(id || '0', 10));

  useEffect(() => {
    if (id) { loadDeployment(); loadLogs(); }
  }, [id]);

  useEffect(() => {
    if (liveLogs.length > 0) setLogs(liveLogs);
  }, [liveLogs]);

  async function loadDeployment() {
    try {
      const r = await api.get(`/api/deployments/${id}`);
      if (r.ok) { const d = await r.json(); setDeployment(d.deployment); }
    } finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!deployment) return;
    const isRunning = deployment.status === 'running';
    const msg = isRunning ? 'Roll back this deployment? The previous version will be redeployed.' : 'Delete this deployment record?';
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      const r = await api.delete(`/api/deployments/${id}`);
      if (r.ok) navigate(`/repositories/${deployment.repo_id}`);
    } finally { setDeleting(false); }
  }

  async function loadLogs() {
    try {
      const r = await api.get(`/api/deployments/${id}/logs?limit=500`);
      if (r.ok) { const d = await r.json(); setLogs(d.logs); }
    } finally { setLogsLoading(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading deployment...</div>;
  if (!deployment) return <div className="flex items-center justify-center py-20 text-muted-foreground">Deployment not found</div>;

  const canAct = user.role === 'admin' || user.role === 'deployer';
  const isRunning = deployment.status === 'running';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-3" asChild>
            <Link to={`/repositories/${deployment.repo_id}`}><ArrowLeft className="w-4 h-4" />Back to Repository</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Deployment #{deployment.id}</h1>
          <div className="flex items-center gap-2 mt-1">
            <DeployBadge status={deployment.status} />
            <span className="text-sm text-muted-foreground">{deployment.repo_full_name}</span>
          </div>
        </div>
        {canAct && (
          <Button variant={isRunning ? 'default' : 'outline'} onClick={handleDelete} disabled={deleting}>
            {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />{isRunning ? 'Rolling back...' : 'Deleting...'}</> : (isRunning ? 'Roll Back' : 'Delete')}
          </Button>
        )}
      </div>

      {/* Deployment Info */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Ref</p>
              <p className="font-mono text-sm font-semibold">{deployment.ref}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Type</p>
              <p className="text-sm font-medium capitalize">{deployment.ref_type}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Started</p>
              <p className="text-sm">{new Date(deployment.started_at).toLocaleString()}</p>
            </div>
            {deployment.tunnel_url && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Tunnel</p>
                <a href={deployment.tunnel_url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  {deployment.tunnel_url}<ExternalLink className="w-3 h-3" />
                </a>
                {deployment.tunnel_port && <p className="text-xs text-muted-foreground mt-1">Port: {deployment.tunnel_port}</p>}
              </div>
            )}
            {deployment.container_id && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Container</p>
                <p className="font-mono text-xs">{deployment.container_id.substring(0, 12)}</p>
              </div>
            )}
            {deployment.triggered_by_login && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Triggered By</p>
                <p className="text-sm">{deployment.triggered_by_login}</p>
              </div>
            )}
            {deployment.env_vars && Object.keys(deployment.env_vars).length > 0 && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Env Vars ({Object.keys(deployment.env_vars).length})
                </p>
                <div className="bg-zinc-950 rounded-md p-3 font-mono text-xs max-h-40 overflow-y-auto space-y-1">
                  {Object.entries(deployment.env_vars).map(([key, value]) => {
                    const isSecret = /secret|key|password|token/i.test(key);
                    return (
                      <div key={key} className="text-zinc-300">
                        <span className="text-zinc-500">{key}=</span>{isSecret ? '••••••••' : value}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {deployment.error_message && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription className="font-mono text-xs whitespace-pre-wrap">{deployment.error_message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">Build Logs</CardTitle>
          <Badge variant={connected ? 'success' : 'secondary'} className="flex items-center gap-1 text-xs">
            <Radio className="w-3 h-3" />
            {connected ? 'Live' : 'Connecting...'}
          </Badge>
        </CardHeader>
        <CardContent className="p-0 pb-0">
          <div className="h-[500px] rounded-b-lg overflow-hidden">
            {logsLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground bg-zinc-950">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-zinc-500" />
                <span className="text-zinc-500 text-sm">Loading logs...</span>
              </div>
            ) : (
              <LogViewer logs={logs} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
