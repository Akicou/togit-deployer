import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
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
      setName('');
      setDescription('');
      setShowCreate(false);
      await loadProjects();
    }
  }

  async function requestAccess(projectId: number) {
    await api.post(`/api/projects/${projectId}/request-access`);
    await loadProjects();
  }

  if (loading) return <div style={{ color: '#666', fontWeight: 700 }}>Loading projects...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, letterSpacing: '-1px' }}>PROJECTS</h1>
          <p style={{ color: '#666', fontWeight: 600 }}>{projects.length} configured</p>
        </div>
        {canCreate && <button onClick={() => setShowCreate(true)} style={buttonPrimary}>Create Project</button>}
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {projects.map((project) => (
          <div key={project.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{project.name}</div>
                  {project.name === 'default-project' && <span style={badgeDark}>Default</span>}
                  {project.has_access ? <span style={badgeLight}>Accessible</span> : <span style={badgeLight}>Request needed</span>}
                </div>
                <div style={{ color: '#666', marginTop: 6 }}>{project.description || 'No description'}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 13, fontWeight: 700, color: '#444' }}>
                  <span>{project.service_count || 0} services</span>
                  <span>{project.active_tunnel_count || 0} active tunnels</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Link to={`/projects/${project.id}`} style={buttonSecondary}>Open</Link>
                {!project.has_access && !project.access_request_pending && (
                  <button onClick={() => requestAccess(project.id)} style={buttonPrimary}>Request Access</button>
                )}
                {!project.has_access && project.access_request_pending && (
                  <span style={badgeDark}>Request Pending</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div style={modalBackdrop}>
          <div style={modalStyle}>
            <h2 style={{ marginTop: 0, fontSize: 24, fontWeight: 800 }}>Create Project</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="project-name" style={inputStyle} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreate(false)} style={buttonSecondary}>Cancel</button>
              <button onClick={createProject} style={buttonPrimary}>Create</button>
            </div>
          </div>
        </div>
      )}
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
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess() {
    await api.post(`/api/projects/${projectId}/request-access`);
    await load();
  }

  async function createTunnel(repoId: number) {
    await api.post(`/api/repos/${repoId}/tunnel`);
    await load();
  }

  async function stopTunnel(repoId: number) {
    await api.delete(`/api/repos/${repoId}/tunnel`);
    await load();
  }

  async function deployService(repoId: number) {
    await api.post(`/api/repos/${repoId}/deploy`, {});
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

  if (loading) return <div style={{ color: '#666', fontWeight: 700 }}>Loading project...</div>;
  if (!data) return <div style={{ color: '#666', fontWeight: 700 }}>Project not found.</div>;

  const isManager = user.role === 'admin' || data.project.created_by === user.id;
  const canDeploy = !!data.project.can_deploy || isManager;
  const hasAccess = !!data.project.has_access || isManager;

  return (
    <div>
      <Link to="/projects" style={{ ...buttonSecondary, display: 'inline-block', marginBottom: 20 }}>← Back to Projects</Link>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
          <div style={{ flex: 1 }}>
            {editing ? (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>{data.project.name}</h1>
                  {data.project.name === 'default-project' && <span style={badgeDark}>Default</span>}
                  {hasAccess ? <span style={badgeLight}>Accessible</span> : <span style={badgeLight}>Request needed</span>}
                </div>
                <p style={{ color: '#666', marginTop: 8 }}>{data.project.description || 'No description'}</p>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isManager && !editing && <button onClick={() => setEditing(true)} style={buttonSecondary}>Edit Project</button>}
            {isManager && editing && <button onClick={saveProject} style={buttonPrimary}>Save</button>}
            {isManager && editing && <button onClick={() => setEditing(false)} style={buttonSecondary}>Cancel</button>}
            {!hasAccess && !data.project.access_request_pending && <button onClick={requestAccess} style={buttonPrimary}>Request Access</button>}
            {!hasAccess && data.project.access_request_pending && <span style={badgeDark}>Request Pending</span>}
            {canDeploy && <button onClick={() => setShowAddService(true)} style={buttonPrimary}>Add Service</button>}
          </div>
        </div>
      </div>

      {hasAccess ? (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <h2 style={sectionTitle}>Services</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.services.map((service) => (
              <div key={service.id} style={{ border: '2px solid #1a1a1a', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800 }}>{service.full_name}</div>
                    <span style={badgeLight}>service: {service.service_name}</span>
                  </div>
                  <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                    path: {service.root_path} · branch: {service.watch_branch} · mode: {service.deploy_mode}
                  </div>
                  <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>
                    tunnel: {service.active_tunnel_url || 'not active'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Link to={`/repositories/${service.id}`} style={buttonSecondary}>Open Service</Link>
                  {canDeploy && <button onClick={() => deployService(service.id)} style={buttonPrimary}>Deploy</button>}
                  {canDeploy && (service.active_tunnel_url
                    ? <button onClick={() => stopTunnel(service.id)} style={buttonSecondary}>Stop Tunnel</button>
                    : <button onClick={() => createTunnel(service.id)} style={buttonSecondary}>Create Tunnel</button>)}
                </div>
              </div>
            ))}
            {data.services.length === 0 && <div style={{ color: '#666', fontWeight: 700 }}>No services in this project yet.</div>}
          </div>
        </div>
      ) : (
        <div style={cardStyle}>
          <h2 style={sectionTitle}>Project Access</h2>
          <p style={{ color: '#666', fontWeight: 600, margin: 0 }}>You can see this project exists, but you need access before you can view its services or deploy them.</p>
        </div>
      )}

      {isManager && (
        <div style={cardStyle}>
          <h2 style={sectionTitle}>Pending Access Requests</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.pending_access_requests.map((req) => (
              <div key={req.user_id} style={{ border: '2px solid #1a1a1a', padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800 }}>{req.github_login}</div>
                <button onClick={() => approve(req.user_id)} style={buttonPrimary}>Approve</button>
              </div>
            ))}
            {data.pending_access_requests.length === 0 && <div style={{ color: '#666', fontWeight: 700 }}>No pending requests.</div>}
          </div>
        </div>
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
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [config, setConfig] = useState({
    service_name: 'app',
    root_path: '/',
    deploy_mode: 'release' as 'release' | 'commit',
    watch_branch: 'main',
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.length >= 2) searchRepos();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  async function searchRepos() {
    setLoading(true);
    try {
      const response = await api.get(`/api/repos/search?q=${encodeURIComponent(search)}`);
      const data = await response.json();
      setResults(data.repos || []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    try {
      await api.post('/api/repos', {
        owner: selected.owner,
        name: selected.name,
        project_id: project.id,
        ...config,
      });
      await onAdded();
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: 24, fontWeight: 800 }}>Add Service to {project.name}</h2>
        {!selected ? (
          <>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search GitHub repositories..." style={inputStyle} autoFocus />
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {loading ? <div style={{ color: '#666', fontWeight: 700 }}>Searching...</div> : results.map((repo) => (
                <div key={repo.id} style={{ border: '2px solid #1a1a1a', padding: 14, marginBottom: 10, cursor: 'pointer' }} onClick={() => setSelected(repo)}>
                  <div style={{ fontWeight: 800 }}>{repo.full_name}</div>
                  <div style={{ color: '#666', fontSize: 12 }}>{repo.private ? 'Private' : 'Public'}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ border: '2px solid #1a1a1a', padding: 12, marginBottom: 12 }}>
              <div style={{ fontWeight: 800 }}>{selected.full_name}</div>
              <button onClick={() => setSelected(null)} style={{ ...buttonSecondary, marginTop: 10 }}>Change</button>
            </div>
            <input value={config.service_name} onChange={(e) => setConfig({ ...config, service_name: e.target.value })} placeholder="Service name" style={inputStyle} />
            <input value={config.root_path} onChange={(e) => setConfig({ ...config, root_path: e.target.value })} placeholder="Root path" style={inputStyle} />
            <select value={config.deploy_mode} onChange={(e) => setConfig({ ...config, deploy_mode: e.target.value as 'release' | 'commit' })} style={inputStyle}>
              <option value="release">Release</option>
              <option value="commit">Commit</option>
            </select>
            <input value={config.watch_branch} onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })} placeholder="Watch branch" style={inputStyle} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={buttonSecondary}>Cancel</button>
              <button onClick={handleAdd} style={buttonPrimary}>{adding ? 'Adding...' : 'Add Service'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: '#fff', border: '3px solid #1a1a1a', padding: 24, boxShadow: '4px 4px 0 #1a1a1a' };
const buttonPrimary: React.CSSProperties = { padding: '12px 18px', border: '3px solid #1a1a1a', background: '#1a1a1a', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '4px 4px 0 #1a1a1a' };
const buttonSecondary: React.CSSProperties = { padding: '10px 16px', border: '2px solid #1a1a1a', background: '#fff', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', textDecoration: 'none', height: 'fit-content' };
const inputStyle: React.CSSProperties = { width: '100%', padding: 12, border: '2px solid #1a1a1a', marginBottom: 12, fontSize: 14, boxSizing: 'border-box' };
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalStyle: React.CSSProperties = { width: 'min(640px, 92vw)', maxHeight: '85vh', overflow: 'auto', background: '#fff', border: '3px solid #1a1a1a', boxShadow: '8px 8px 0 #1a1a1a', padding: 24 };
const badgeDark: React.CSSProperties = { fontSize: 11, padding: '4px 10px', border: '2px solid #1a1a1a', background: '#1a1a1a', color: '#fff', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', height: 'fit-content' };
const badgeLight: React.CSSProperties = { fontSize: 11, padding: '4px 10px', border: '2px solid #1a1a1a', background: '#fff', color: '#1a1a1a', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', height: 'fit-content' };
