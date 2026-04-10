import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, Plus, Rocket, Globe, StopCircle, CheckCircle, Clock, Users } from 'lucide-react';
import type { User, Project, Repository } from '../types';

interface ProjectDetailResponse {
  project: Project;
  services: Array<Repository & { active_tunnel_url?: string | null }>;
  pending_access_requests: Array<{ user_id: number; github_login: string }>;
}

export default function Projects({ user }: { user: User }) {
  const { id } = useParams();
  if (id) return <ProjectDetail user={user} projectId={parseInt(id, 10)} />;
  return <ProjectList user={user} />;
}

function ProjectList({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const canCreate = user.role !== 'viewer';

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    try {
      const res = await api.get('/api/projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    const res = await api.post('/api/projects', { name, description });
    if (res.ok) {
      setName(''); setDescription(''); setShowCreate(false);
      await loadProjects();
    }
  }

  async function requestAccess(projectId: number) {
    await api.post(`/api/projects/${projectId}/request-access`);
    await loadProjects();
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading projects...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">{projects.length} configured</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />New Project
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-base">{project.name}</h3>
                    {project.name === 'default-project' && <Badge variant="secondary">Default</Badge>}
                    {project.has_access
                      ? <Badge variant="success">Accessible</Badge>
                      : <Badge variant="outline">No access</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{project.description || 'No description'}</p>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{project.service_count || 0} services</span>
                    <span>{project.active_tunnel_count || 0} active tunnels</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/projects/${project.id}`}>Open</Link>
                  </Button>
                  {!project.has_access && !project.access_request_pending && (
                    <Button size="sm" onClick={() => requestAccess(project.id)}>Request Access</Button>
                  )}
                  {!project.has_access && project.access_request_pending && (
                    <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {projects.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No projects yet. {canCreate && 'Create your first project to get started.'}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-project" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createProject} disabled={!name.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectDetail({ user, projectId }: { user: User; projectId: number }) {
  const [data, setData] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showAddService, setShowAddService] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/api/projects/${projectId}`);
      if (res.ok) {
        const payload = await res.json();
        setData(payload);
        setName(payload.project.name || '');
        setDescription(payload.project.description || '');
      } else { setData(null); }
    } finally { setLoading(false); }
  }

  async function requestAccess() {
    await api.post(`/api/projects/${projectId}/request-access`);
    await load();
  }

  async function createTunnel(repoId: number) {
    try {
      const res = await api.post(`/api/repos/${repoId}/tunnel`);
      if (res.ok) { toast('Tunnel created', 'success'); }
      else { const d = await res.json(); toast(d.error || 'Failed to create tunnel', 'error'); }
    } catch { toast('Failed to create tunnel — network error', 'error'); }
    await load();
  }

  async function stopTunnel(repoId: number) {
    try {
      const res = await api.delete(`/api/repos/${repoId}/tunnel`);
      if (!res.ok) { const d = await res.json(); toast(d.error || 'Failed to stop tunnel', 'error'); }
    } catch { toast('Failed to stop tunnel — network error', 'error'); }
    await load();
  }

  async function deployService(repoId: number) {
    try {
      const res = await api.post(`/api/repos/${repoId}/deploy`, {});
      if (res.ok) { toast('Deployment started', 'success'); }
      else { const d = await res.json(); toast(d.error || 'Deploy failed', 'error'); }
    } catch { toast('Deploy failed — network error', 'error'); }
    await load();
  }

  async function approve(userId: number) {
    await api.patch(`/api/projects/${projectId}/access-requests/${userId}`, { status: 'approved', can_deploy: true });
    await load();
  }

  async function saveProject() {
    await api.patch(`/api/projects/${projectId}`, { name, description });
    setEditing(false);
    await load();
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading project...</div>;
  if (!data) return <div className="flex items-center justify-center py-20 text-muted-foreground">Project not found.</div>;

  const isManager = user.role === 'admin' || data.project.created_by === user.id;
  const canDeploy = !!data.project.can_deploy || isManager;
  const hasAccess = !!data.project.has_access || isManager;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/projects"><ArrowLeft className="w-4 h-4" />Back to Projects</Link>
      </Button>

      {/* Project header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3">
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="text-lg font-semibold" />
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl font-bold">{data.project.name}</h1>
                    {data.project.name === 'default-project' && <Badge variant="secondary">Default</Badge>}
                    {hasAccess ? <Badge variant="success">Accessible</Badge> : <Badge variant="outline">No access</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{data.project.description || 'No description'}</p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isManager && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>}
              {isManager && editing && <><Button size="sm" onClick={saveProject}>Save</Button><Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button></>}
              {!hasAccess && !data.project.access_request_pending && <Button size="sm" onClick={requestAccess}>Request Access</Button>}
              {!hasAccess && data.project.access_request_pending && <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>}
              {canDeploy && <Button size="sm" onClick={() => setShowAddService(true)}><Plus className="w-4 h-4" />Add Service</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      {hasAccess ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.services.map((service) => (
              <div key={service.id} className="p-4 rounded-md border space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{service.full_name}</span>
                      <Badge variant="secondary">{service.service_name}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {service.root_path} · {service.watch_branch} · {service.deploy_mode}
                    </p>
                    {service.active_tunnel_url && (
                      <a href={service.active_tunnel_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                        <Globe className="w-3 h-3" />{service.active_tunnel_url}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/repositories/${service.id}`}>Open</Link>
                    </Button>
                    {canDeploy && <Button size="sm" onClick={() => deployService(service.id)}><Rocket className="w-3 h-3" />Deploy</Button>}
                    {canDeploy && (service.active_tunnel_url
                      ? <Button variant="outline" size="sm" onClick={() => stopTunnel(service.id)}><StopCircle className="w-3 h-3" />Stop Tunnel</Button>
                      : <Button variant="outline" size="sm" onClick={() => createTunnel(service.id)}><Globe className="w-3 h-3" />Create Tunnel</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {data.services.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No services in this project yet.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">You need access to view services and deploy them.</p>
          </CardContent>
        </Card>
      )}

      {/* Pending access requests */}
      {isManager && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Pending Access Requests
              {data.pending_access_requests.length > 0 && (
                <Badge variant="secondary">{data.pending_access_requests.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.pending_access_requests.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {data.pending_access_requests.map((req) => (
                  <div key={req.user_id} className="flex items-center justify-between p-3 rounded-md border">
                    <span className="font-medium text-sm">{req.github_login}</span>
                    <Button size="sm" onClick={() => approve(req.user_id)}>
                      <CheckCircle className="w-3 h-3" />Approve
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showAddService && (
        <AddServiceModal
          project={data.project}
          onClose={() => setShowAddService(false)}
          onAdded={async () => { setShowAddService(false); await load(); }}
        />
      )}
    </div>
  );
}

function AddServiceModal({ project, onClose, onAdded }: { project: Project; onClose: () => void; onAdded: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [config, setConfig] = useState({ service_name: 'app', root_path: '/', deploy_mode: 'release' as 'release' | 'commit', watch_branch: 'main' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { if (search.length >= 2) searchRepos(); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function searchRepos() {
    setLoadingSearch(true);
    try {
      const r = await api.get(`/api/repos/search?q=${encodeURIComponent(search)}`);
      const d = await r.json();
      setResults(d.repos || []);
    } finally { setLoadingSearch(false); }
  }

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    try {
      await api.post('/api/repos', { owner: selected.owner, name: selected.name, project_id: project.id, ...config });
      await onAdded();
    } finally { setAdding(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Service to {project.name}</DialogTitle>
        </DialogHeader>
        {!selected ? (
          <div className="space-y-3">
            <Input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GitHub repositories..." autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-2">
              {loadingSearch ? (
                <p className="text-sm text-muted-foreground text-center py-4">Searching...</p>
              ) : results.map((repo) => (
                <button
                  key={repo.id} onClick={() => setSelected(repo)}
                  className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <p className="font-medium text-sm">{repo.full_name}</p>
                  <p className="text-xs text-muted-foreground">{repo.private ? 'Private' : 'Public'}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 rounded-md border bg-muted/50">
              <p className="font-medium text-sm">{selected.full_name}</p>
              <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Service Name</Label>
                <Input value={config.service_name} onChange={(e) => setConfig({ ...config, service_name: e.target.value })} placeholder="app" />
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
                    <SelectItem value="release">Release</SelectItem>
                    <SelectItem value="commit">Commit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Watch Branch</Label>
                <Input value={config.watch_branch} onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })} placeholder="main" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleAdd} disabled={adding}>{adding ? 'Adding...' : 'Add Service'}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
