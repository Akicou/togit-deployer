import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import RepoCard from '../components/RepoCard';
import DeployBadge from '../components/DeployBadge';
import { useDeployments } from '../hooks/useDeployments';
import { useToast } from '../components/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Separator } from '../components/ui/separator';
import { ArrowLeft, Plus, Rocket, ExternalLink, RefreshCw, Trash2, Loader2, X } from 'lucide-react';
import type { User, Repository, Project } from '../types';

export default function Repositories({ user }: { user: User }) {
  const { id } = useParams();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState<{ repoId: number; repoName: string } | null>(null);
  const [deployingRepo, setDeployingRepo] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'last_deployed'>('name');
  const toast = useToast();
  const canManage = user.role === 'admin' || user.role === 'deployer';

  useEffect(() => { loadRepos(); loadProjects(); }, []);
  useEffect(() => { filterAndSortRepos(); }, [repos, selectedProject, searchQuery, sortBy]);

  async function loadRepos() {
    try {
      const r = await api.get('/api/repos');
      if (r.ok) { const d = await r.json(); setRepos(d.repos); }
    } finally { setLoading(false); }
  }

  async function loadProjects() {
    try {
      const r = await api.get('/api/projects');
      if (r.ok) { const d = await r.json(); setProjects(d.projects || []); }
    } catch {}
  }

  function filterAndSortRepos() {
    let filtered = [...repos];
    if (selectedProject !== null) filtered = filtered.filter(r => r.project_id === selectedProject);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.full_name.toLowerCase().includes(q) || r.service_name.toLowerCase().includes(q) || (r.project_name && r.project_name.toLowerCase().includes(q)));
    }
    filtered.sort((a, b) => {
      if (sortBy === 'name') return a.full_name.localeCompare(b.full_name);
      if (sortBy === 'status') {
        const ord: Record<string, number> = { running: 0, building: 1, pending: 2, failed: 3, never: 4 };
        return (ord[a.last_deployment_status ?? 'never'] ?? 4) - (ord[b.last_deployment_status ?? 'never'] ?? 4);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setFilteredRepos(filtered);
  }

  async function handleDeployConfirm() {
    if (!showDeployModal) return;
    setDeployingRepo(showDeployModal.repoId);
    try {
      const r = await api.post(`/api/repos/${showDeployModal.repoId}/deploy`, {});
      if (r.ok) { toast('Deployment started', 'success'); await loadRepos(); setShowDeployModal(null); }
      else { const d = await r.json().catch(() => ({})); toast(d.error || 'Deploy failed', 'error'); }
    } catch { toast('Deploy failed — network error', 'error'); }
    finally { setDeployingRepo(null); }
  }

  if (id) {
    const repo = repos.find((r) => r.id === parseInt(id, 10));
    if (!repo && !loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Service not found.</div>;
    if (!repo) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading...</div>;
    return <RepoDetail repo={repo} user={user} onRefresh={loadRepos} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Services</h1>
          <p className="text-muted-foreground text-sm mt-1">{filteredRepos.length} of {repos.length} services</p>
        </div>
        {canManage && <Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4" />Add Service</Button>}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Project</Label>
              <Select value={selectedProject !== null ? String(selectedProject) : '__all__'} onValueChange={(v) => setSelectedProject(v === '__all__' ? null : parseInt(v, 10))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Service name or repo..." className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort By</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="last_deployed">Last Deployed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(selectedProject !== null || searchQuery.trim()) && (
            <div className="flex gap-2 mt-3 pt-3 border-t flex-wrap">
              {selectedProject !== null && (
                <Badge variant="secondary" className="cursor-pointer gap-1" onClick={() => setSelectedProject(null)}>
                  {projects.find(p => p.id === selectedProject)?.name}<X className="w-3 h-3" />
                </Badge>
              )}
              {searchQuery.trim() && (
                <Badge variant="secondary" className="cursor-pointer gap-1" onClick={() => setSearchQuery('')}>
                  "{searchQuery}"<X className="w-3 h-3" />
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repo grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading...</div>
      ) : filteredRepos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-muted-foreground">{repos.length === 0 ? 'No services yet.' : 'No matching services.'}</p>
            {canManage && repos.length === 0 && <Button onClick={() => setShowAddModal(true)}><Plus className="w-4 h-4" />Add Your First Service</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRepos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} canDeploy={canManage} onDeploy={(id, name) => setShowDeployModal({ repoId: id, repoName: name })} />
          ))}
        </div>
      )}

      {/* Deploy confirm dialog */}
      <Dialog open={!!showDeployModal} onOpenChange={() => setShowDeployModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deploy {showDeployModal?.repoName}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will trigger a new deployment for this service.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployModal(null)}>Cancel</Button>
            <Button onClick={handleDeployConfirm} disabled={deployingRepo === showDeployModal?.repoId}>
              {deployingRepo === showDeployModal?.repoId ? <><Loader2 className="w-4 h-4 animate-spin" />Deploying...</> : <><Rocket className="w-4 h-4" />Deploy</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAddModal && (
        <AddRepoModal projects={projects} onClose={() => setShowAddModal(false)} onAdd={() => { loadRepos(); setShowAddModal(false); }} />
      )}
    </div>
  );
}

function RepoDetail({ repo, user, onRefresh }: { repo: Repository; user: User; onRefresh: () => void }) {
  const { deployments, loading: deploysLoading } = useDeployments(repo.id);
  const navigate = useNavigate();
  const toast = useToast();
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployForce, setDeployForce] = useState(false);
  const [config, setConfig] = useState({
    root_path: repo.root_path,
    deploy_mode: repo.deploy_mode,
    watch_branch: repo.watch_branch ?? 'main',
    enabled: repo.enabled,
    service_name: repo.service_name ?? 'app',
    container_port: repo.container_port ?? 3000,
    tunnel_type: (repo.tunnel_type ?? 'random') as 'random' | 'subdomain' | 'custom-domain',
    tunnel_subdomain: repo.tunnel_subdomain ?? '',
    tunnel_domain: repo.tunnel_domain ?? '',
  });
  const [envVars, setEnvVars] = useState<Record<string, string>>(
    typeof repo.deployment_env_vars === 'object' ? (repo.deployment_env_vars as Record<string, string>) : {}
  );
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resettingTunnel, setResettingTunnel] = useState(false);
  const [showRawEditor, setShowRawEditor] = useState(false);

  const isDeploying = repo.last_deployment_status === 'pending' || repo.last_deployment_status === 'building';
  const canAct = user.role === 'admin' || user.role === 'deployer';

  async function handleDeployConfirm() {
    setDeploying(true);
    try {
      const r = await api.post(`/api/repos/${repo.id}/deploy`, { force: deployForce });
      if (r.ok) { toast('Deployment started', 'success'); setShowDeployModal(false); setDeployForce(false); onRefresh(); }
      else { const d = await r.json().catch(() => ({})); toast(d.error || 'Deploy failed', 'error'); }
    } catch { toast('Deploy failed — network error', 'error'); }
    finally { setDeploying(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await api.patch(`/api/repos/${repo.id}`, {
        ...config,
        deployment_env_vars: envVars,
        tunnel_subdomain: config.tunnel_subdomain || null,
        tunnel_domain: config.tunnel_domain || null,
      });
      if (r.ok) { toast('Changes saved', 'success'); onRefresh(); }
      else { const d = await r.json().catch(() => ({})); toast(d.error || 'Failed to save', 'error'); }
    } catch { toast('Failed to save — network error', 'error'); }
    finally { setSaving(false); }
  }

  async function handleResetTunnel() {
    if (!window.confirm(`Reset tunnel for ${repo.full_name}? A new URL will be created on next deploy.`)) return;
    setResettingTunnel(true);
    try {
      const r = await api.post(`/api/repos/${repo.id}/reset-tunnel`);
      if (r.ok) { toast('Tunnel reset — deploy again to get new URL', 'success'); onRefresh(); }
      else { const d = await r.json().catch(() => ({})); toast(d.error || 'Failed to reset tunnel', 'error'); }
    } catch { toast('Network error', 'error'); }
    finally { setResettingTunnel(false); }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${repo.full_name}? This removes all deployments and logs.`)) return;
    setDeleting(true);
    try {
      const r = await api.delete(`/api/repos/${repo.id}`);
      if (r.ok) { toast(`Deleted ${repo.full_name}`, 'success'); onRefresh(); navigate('/repositories'); }
      else { const d = await r.json().catch(() => ({})); toast(d.error || 'Failed to delete', 'error'); }
    } catch { toast('Network error', 'error'); }
    finally { setDeleting(false); }
  }

  const tunnelUrl = repo.tunnel_url || repo.last_tunnel_url;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-3" asChild>
            <Link to="/repositories"><ArrowLeft className="w-4 h-4" />Back</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{repo.full_name}</h1>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <DeployBadge status={repo.last_deployment_status || 'never'} />
            {tunnelUrl && (
              <a href={tunnelUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />{tunnelUrl}
              </a>
            )}
            {repo.tunnel_port && (
              <span className="font-mono text-xs text-muted-foreground">:{repo.tunnel_port}→:{repo.container_port ?? 3000}</span>
            )}
            {canAct && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleResetTunnel} disabled={resettingTunnel}>
                {resettingTunnel ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Reset Tunnel
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'admin' && (
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete
            </Button>
          )}
          {canAct && (
            <Button onClick={() => setShowDeployModal(true)} disabled={isDeploying}>
              {isDeploying ? <><Loader2 className="w-4 h-4 animate-spin" />Deploying...</> : <><Rocket className="w-4 h-4" />Deploy Now</>}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Service Name</Label>
              <Input value={config.service_name} onChange={(e) => setConfig({ ...config, service_name: e.target.value })} placeholder="app" />
              <p className="text-xs text-muted-foreground">For monorepo: use different names per service</p>
            </div>
            <div className="space-y-1.5">
              <Label>Root Path</Label>
              <Input value={config.root_path} onChange={(e) => setConfig({ ...config, root_path: e.target.value })} placeholder="/" />
            </div>
            <div className="space-y-1.5">
              <Label>Deploy Mode</Label>
              <Select value={config.deploy_mode} onValueChange={(v) => setConfig({ ...config, deploy_mode: v as 'release' | 'commit' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Release — deploy on new tags</SelectItem>
                  <SelectItem value="commit">Commit — deploy on new commits</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Watch Branch</Label>
              <Input value={config.watch_branch} onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })} placeholder="main" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="auto-deploy" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} className="w-4 h-4 accent-primary" />
              <Label htmlFor="auto-deploy">Auto-deploy enabled</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Container Port</Label>
              <Input type="number" value={config.container_port} onChange={(e) => setConfig({ ...config, container_port: parseInt(e.target.value, 10) || 3000 })} min="1" max="65535" />
              <p className="text-xs text-muted-foreground">Port your app listens on inside the container</p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>Tunnel URL Mode</Label>
              <Select value={config.tunnel_type} onValueChange={(v) => setConfig({ ...config, tunnel_type: v as typeof config.tunnel_type })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">Random subdomain (auto)</SelectItem>
                  <SelectItem value="subdomain">Custom subdomain on localto.net</SelectItem>
                  <SelectItem value="custom-domain">Custom domain (your own)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.tunnel_type === 'subdomain' && (
              <>
                <div className="space-y-1.5">
                  <Label>Subdomain Name</Label>
                  <Input value={config.tunnel_subdomain} onChange={(e) => setConfig({ ...config, tunnel_subdomain: e.target.value })} placeholder="myapp" />
                </div>
                <div className="space-y-1.5">
                  <Label>Base Domain</Label>
                  <Input value={config.tunnel_domain} onChange={(e) => setConfig({ ...config, tunnel_domain: e.target.value })} placeholder="localto.net" />
                  <p className="text-xs text-muted-foreground">Result: {config.tunnel_subdomain || 'myapp'}.{config.tunnel_domain || 'localto.net'}</p>
                </div>
              </>
            )}
            {config.tunnel_type === 'custom-domain' && (
              <div className="space-y-1.5">
                <Label>Custom Domain</Label>
                <Input value={config.tunnel_domain} onChange={(e) => setConfig({ ...config, tunnel_domain: e.target.value })} placeholder="myapp.com" />
                <p className="text-xs text-muted-foreground">Must be linked to your Localtonet account</p>
              </div>
            )}

            <Separator />

            {/* Env vars */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Environment Variables</Label>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowRawEditor(true)}>Raw Editor</Button>
              </div>
              <div className="space-y-2">
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <Input value={key} readOnly className="flex-1 font-mono text-xs bg-muted" />
                    <Input value={value} onChange={(e) => setEnvVars({ ...envVars, [key]: e.target.value })} className="flex-[2] font-mono text-xs" />
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => { const c = { ...envVars }; delete c[key]; setEnvVars(c); }}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="KEY" className="flex-1 font-mono text-xs" />
                  <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" className="flex-[2] font-mono text-xs" />
                  <Button size="sm" className="h-10" onClick={() => { if (newKey.trim()) { setEnvVars({ ...envVars, [newKey.trim()]: newValue }); setNewKey(''); setNewValue(''); } }}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Deployment History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deployment History</CardTitle>
          </CardHeader>
          <CardContent>
            {deploysLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading...</div>
            ) : deployments.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">No deployments yet</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {deployments.map((d) => (
                  <Link key={d.id} to={`/deployments/${d.id}`}
                    className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors no-underline">
                    <div>
                      <p className="font-mono text-xs font-semibold text-foreground">{d.ref.substring(0, 12)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(d.started_at).toLocaleString()}</p>
                    </div>
                    <DeployBadge status={d.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Deploy modal */}
      <Dialog open={showDeployModal} onOpenChange={setShowDeployModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deploy {repo.full_name}?</DialogTitle></DialogHeader>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="force" checked={deployForce} onChange={(e) => setDeployForce(e.target.checked)} className="w-4 h-4 accent-primary" />
            <Label htmlFor="force">Force deploy (skip update check)</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeployModal(false); setDeployForce(false); }}>Cancel</Button>
            <Button onClick={handleDeployConfirm} disabled={deploying}>
              {deploying ? <><Loader2 className="w-4 h-4 animate-spin" />Deploying...</> : <><Rocket className="w-4 h-4" />Deploy</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raw env editor */}
      <Dialog open={showRawEditor} onOpenChange={setShowRawEditor}>
        <DialogContent>
          <DialogHeader><DialogTitle>Raw Env Editor</DialogTitle></DialogHeader>
          <RawEditorContent
            envVars={envVars}
            onUpdate={(v) => { setEnvVars(v); setShowRawEditor(false); }}
            onClose={() => setShowRawEditor(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RawEditorContent({ envVars, onUpdate, onClose }: { envVars: Record<string, string>; onUpdate: (v: Record<string, string>) => void; onClose: () => void }) {
  const [raw, setRaw] = useState(() => Object.entries(envVars).map(([k, v]) => `${k}=${v}`).join('\n'));

  function handleSave() {
    const parsed: Record<string, string> = {};
    raw.split('\n').forEach((line) => {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const k = line.substring(0, eqIdx).trim();
        const v = line.substring(eqIdx + 1);
        if (k) parsed[k] = v;
      }
    });
    onUpdate(parsed);
  }

  return (
    <>
      <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} className="font-mono text-xs min-h-[200px]" placeholder="KEY=value&#10;ANOTHER_KEY=another_value" />
      <p className="text-xs text-muted-foreground">One variable per line: KEY=value</p>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Apply</Button>
      </DialogFooter>
    </>
  );
}

function AddRepoModal({ projects, onClose, onAdd }: { projects: Project[]; onClose: () => void; onAdd: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [config, setConfig] = useState({
    project_id: projects[0]?.id ?? 0,
    service_name: 'app',
    root_path: '/',
    deploy_mode: 'release' as 'release' | 'commit',
    watch_branch: 'main',
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { if (search.length >= 2) searchRepos(); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function searchRepos() {
    setLoading(true);
    try {
      const r = await api.get(`/api/repos/search?q=${encodeURIComponent(search)}`);
      if (r.ok) { const d = await r.json(); setResults(d.repos); }
    } finally { setLoading(false); }
  }

  async function handleAdd() {
    if (!selected || !config.project_id) return;
    setAdding(true);
    try {
      await api.post('/api/repos', { owner: selected.owner, name: selected.name, ...config });
      onAdd();
    } finally { setAdding(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Repository</DialogTitle></DialogHeader>
        {!selected ? (
          <div className="space-y-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search GitHub repositories..." autoFocus />
            <div className="max-h-72 overflow-y-auto space-y-2">
              {loading ? <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
                : search.length >= 2 && results.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No repositories found</p>
                : results.map((repo) => (
                  <button key={repo.id} onClick={() => setSelected(repo)} className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{repo.full_name}</p>
                      {repo.private && <Badge variant="outline" className="text-xs">Private</Badge>}
                    </div>
                  </button>
                ))
              }
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-md border bg-muted/50 flex items-center justify-between">
              <p className="font-medium text-sm">{selected.full_name}</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(null)}>Change</Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={String(config.project_id)} onValueChange={(v) => setConfig({ ...config, project_id: parseInt(v, 10) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Service Name</Label>
                <Input value={config.service_name} onChange={(e) => setConfig({ ...config, service_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Root Path</Label>
                <Input value={config.root_path} onChange={(e) => setConfig({ ...config, root_path: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Deploy Mode</Label>
                <Select value={config.deploy_mode} onValueChange={(v) => setConfig({ ...config, deploy_mode: v as 'release' | 'commit' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="commit">Commit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Watch Branch</Label>
                <Input value={config.watch_branch} onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleAdd} disabled={adding || !config.project_id}>{adding ? 'Adding...' : 'Add Service'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
