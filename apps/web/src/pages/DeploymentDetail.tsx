import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import LogViewer from '../components/LogViewer';
import DeployBadge from '../components/DeployBadge';
import type { Deployment, Log } from '../types';

export default function DeploymentDetail({ user }: { user: any }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [stoppingTunnel, setStoppingTunnel] = useState(false);

  const { logs: liveLogs, connected } = useWebSocket(parseInt(id || '0', 10));

  useEffect(() => {
    if (id) {
      loadDeployment();
      loadLogs();
    }
  }, [id]);

  useEffect(() => {
    if (liveLogs.length > 0) {
      setLogs(liveLogs);
    }
  }, [liveLogs]);

  async function loadDeployment() {
    try {
      const response = await api.get(`/api/deployments/${id}`);
      if (response.ok) {
        const data = await response.json();
        setDeployment(data.deployment);
      }
    } catch (error) {
      console.error('Failed to load deployment:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deployment || !confirm('Delete this deployment? This will stop the container and tunnel.')) return;
    setDeleting(true);
    try {
      const response = await api.delete(`/api/deployments/${id}`);
      if (response.ok) {
        navigate(`/repositories/${deployment.repo_id}`);
      }
    } catch (error) {
      console.error('Failed to delete deployment:', error);
    } finally {
      setDeleting(false);
    }
  }

  async function handleStopTunnel() {
    if (!deployment?.localtonet_tunnel_id || !confirm('Stop this tunnel? This will mark the deployment as rolled back.')) return;
    setStoppingTunnel(true);
    try {
      const response = await api.post(`/api/tunnels/${id}/stop`);
      if (response.ok) {
        loadDeployment();
      } else {
        const data = await response.json();
        alert(`Failed to stop tunnel: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to stop tunnel:', error);
      alert('Failed to stop tunnel');
    } finally {
      setStoppingTunnel(false);
    }
  }

  async function loadLogs() {
    try {
      const response = await api.get(`/api/deployments/${id}/logs?limit=500`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600 }}>
        Loading deployment...
      </div>
    );
  }

  if (!deployment) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600 }}>
        Deployment not found
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28 }}
      >
        <Link
          to={`/repositories/${deployment.repo_id}`}
          style={{
            color: '#666',
            textDecoration: 'none',
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 20,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          ← Back to Repository
        </Link>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#1a1a1a', marginBottom: 12, letterSpacing: '-1px' }}>
              DEPLOYMENT #{deployment.id}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <DeployBadge status={deployment.status} />
              <span style={{ color: '#666', fontSize: 14, fontWeight: 600 }}>
                {deployment.repo_full_name}
              </span>
            </div>
          </div>
          {(user.role === 'admin' || user.role === 'deployer') && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '12px 20px',
                border: '3px solid #1a1a1a',
                background: deleting ? '#f5f5f5' : '#ffffff',
                color: deleting ? '#666' : '#1a1a1a',
                fontWeight: 800,
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 13,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: deleting ? '1px 1px 0 #1a1a1a' : '4px 4px 0 #1a1a1a',
                transition: 'all 0.1s ease',
              }}
              onMouseOver={(e) => {
                if (!deleting) {
                  e.currentTarget.style.background = '#1a1a1a';
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                  e.currentTarget.style.transform = 'translate(2px, 2px)';
                }
              }}
              onMouseOut={(e) => {
                if (!deleting) {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.color = '#1a1a1a';
                  e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
                  e.currentTarget.style.transform = 'translate(0, 0)';
                }
              }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </motion.div>

      {/* Deployment Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          background: '#ffffff',
          border: '3px solid #1a1a1a',
          padding: 28,
          marginBottom: 24,
          boxShadow: '4px 4px 0 #1a1a1a',
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
        }}>
          <div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ref</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1a1a1a', fontWeight: 700, fontSize: 15 }}>
              {deployment.ref}
            </div>
          </div>

          <div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
            <div style={{ color: '#1a1a1a', fontWeight: 700, textTransform: 'capitalize', fontSize: 15 }}>
              {deployment.ref_type}
            </div>
          </div>

          <div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Started</div>
            <div style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 15 }}>
              {new Date(deployment.started_at).toLocaleString()}
            </div>
          </div>

          {deployment.tunnel_url && (
            <div>
              <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tunnel</div>
              <a
                href={deployment.tunnel_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#1a1a1a',
                  textDecoration: 'underline',
                  fontWeight: 700,
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                {deployment.tunnel_url} ↗
              </a>
              {deployment.tunnel_port && (
                <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 4 }}>
                  Local port: <span style={{ fontFamily: 'monospace', color: '#1a1a1a' }}>{deployment.tunnel_port}</span>
                </div>
              )}
              {deployment.localtonet_tunnel_id && (
                <div style={{ fontSize: 11, color: '#666', fontWeight: 600, marginBottom: 8 }}>
                  Tunnel ID: <span style={{ fontFamily: 'monospace', color: '#1a1a1a' }}>{deployment.localtonet_tunnel_id}</span>
                </div>
              )}
              {(user.role === 'admin' || user.role === 'deployer') && (
                <button
                  onClick={handleStopTunnel}
                  disabled={stoppingTunnel}
                  style={{
                    padding: '6px 12px',
                    border: '2px solid #cc0000',
                    background: stoppingTunnel ? '#f5f5f5' : '#cc0000',
                    color: stoppingTunnel ? '#666' : '#ffffff',
                    fontWeight: 800,
                    cursor: stoppingTunnel ? 'not-allowed' : 'pointer',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {stoppingTunnel ? 'Stopping...' : 'Stop Tunnel'}
                </button>
              )}
            </div>
          )}

          {deployment.container_id && (
            <div>
              <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Container</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1a1a1a', fontSize: 13, fontWeight: 700 }}>
                {deployment.container_id.substring(0, 12)}...
              </div>
            </div>
          )}

          {deployment.triggered_by_login && (
            <div>
              <div style={{ color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Triggered By</div>
              <div style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 15 }}>
                {deployment.triggered_by_login}
              </div>
            </div>
          )}
        </div>

        {deployment.error_message && (
          <div style={{
            marginTop: 24,
            padding: 20,
            border: '3px solid #1a1a1a',
            background: '#f5f5f5',
            boxShadow: '4px 4px 0 #1a1a1a',
          }}>
            <div style={{ color: '#1a1a1a', fontWeight: 800, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 12 }}>
              ⚠ Error
            </div>
            <div style={{ color: '#1a1a1a', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, lineHeight: 1.6 }}>
              {deployment.error_message}
            </div>
          </div>
        )}
      </motion.div>

      {/* Live Logs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          background: '#ffffff',
          border: '3px solid #1a1a1a',
          padding: 28,
          boxShadow: '4px 4px 0 #1a1a1a',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Build Logs
          </h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            border: '2px solid #1a1a1a',
            background: connected ? '#1a1a1a' : '#ffffff',
            color: connected ? '#ffffff' : '#666',
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            <span style={{
              width: 6,
              height: 6,
              background: connected ? '#ffffff' : '#666',
            }} />
            {connected ? 'LIVE' : 'CONNECTING...'}
          </div>
        </div>

        <div style={{ height: 500 }}>
          {logsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              Loading logs...
            </div>
          ) : (
            <LogViewer logs={logs} />
          )}
        </div>
      </motion.div>
    </div>
  );
}
