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
                <div style={{ fontSize: 24, fontWeight: 800 }}>{project.name}</div>
                <div style={{ color: '#666', marginTop: 6 }}>{project.description || 'No description'}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 13, fontWeight: 700, color: '#444' }}>
                  <span>{project.service_count || 0} services</span>
                  <span>{project.active_tunnel_count || 0} active tunnels</span>
                </div>
              </div>
              <Link to={`/projects/${project.id}`} style={buttonSecondary}>Open</Link>
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

  useEffect(() => { load(); }, [projectId]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/api/projects/${projectId}`);
      if (res.ok) setData(await res.json());
      else setData(null);
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

  async function approve(userId: number) {
    await api.patch(`/api/projects/${projectId}/access-requests/${userId}`, { status: 'approved', can_deploy: true });
    await load();
  }

  if (loading) return <div style={{ color: '#666', fontWeight: 700 }}>Loading project...</div>;
  if (!data) return <div style={{ color: '#666', fontWeight: 700 }}>Project not found or access denied.</div>;

  const isManager = user.role === 'admin' || data.project.created_by === user.id;

  return (
    <div>
      <Link to="/projects" style={{ ...buttonSecondary, display: 'inline-block', marginBottom: 20 }}>← Back to Projects</Link>
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>{data.project.name}</h1>
            <p style={{ color: '#666', marginTop: 8 }}>{data.project.description || 'No description'}</p>
          </div>
          {!isManager && <button onClick={requestAccess} style={buttonPrimary}>Request Access</button>}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <h2 style={sectionTitle}>Services</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {data.services.map((service) => (
            <div key={service.id} style={{ border: '2px solid #1a1a1a', padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800 }}>{service.full_name}</div>
                <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                  service: {service.service_name} · path: {service.root_path} · branch: {service.watch_branch}
                </div>
                <div style={{ color: '#444', fontSize: 13, marginTop: 8 }}>
                  tunnel: {service.active_tunnel_url || 'not active'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Link to={`/repositories/${service.id}`} style={buttonSecondary}>Open Service</Link>
                {service.active_tunnel_url
                  ? <button onClick={() => stopTunnel(service.id)} style={buttonSecondary}>Stop Tunnel</button>
                  : <button onClick={() => createTunnel(service.id)} style={buttonPrimary}>Create Tunnel</button>}
              </div>
            </div>
          ))}
          {data.services.length === 0 && <div style={{ color: '#666', fontWeight: 700 }}>No services in this project yet.</div>}
        </div>
      </div>

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
    </div>
  );
}

const sectionTitle: React.CSSProperties = { marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 800 };
const cardStyle: React.CSSProperties = { background: '#fff', border: '3px solid #1a1a1a', padding: 24, boxShadow: '4px 4px 0 #1a1a1a' };
const buttonPrimary: React.CSSProperties = { padding: '12px 18px', border: '3px solid #1a1a1a', background: '#1a1a1a', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '4px 4px 0 #1a1a1a' };
const buttonSecondary: React.CSSProperties = { padding: '10px 16px', border: '2px solid #1a1a1a', background: '#fff', color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', textDecoration: 'none', height: 'fit-content' };
const inputStyle: React.CSSProperties = { width: '100%', padding: 12, border: '2px solid #1a1a1a', marginBottom: 12, fontSize: 14, boxSizing: 'border-box' };
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalStyle: React.CSSProperties = { width: 'min(560px, 92vw)', background: '#fff', border: '3px solid #1a1a1a', boxShadow: '8px 8px 0 #1a1a1a', padding: 24 };
