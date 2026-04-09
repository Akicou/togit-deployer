import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import LogViewer from '../components/LogViewer';
import DeployBadge from '../components/DeployBadge';
import type { Deployment, Log, User } from '../types';

export default function DeploymentDetail({ user }: { user: User }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

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
      <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
        Loading deployment...
      </div>
    );
  }

  if (!deployment) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
        Deployment not found
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}
      >
        <Link
          to={`/repositories/${deployment.repo_id}`}
          style={{
            color: '#8b949e',
            textDecoration: 'none',
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 16,
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
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
              Deployment #{deployment.id}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <DeployBadge status={deployment.status} />
              <span style={{ color: '#8b949e', fontSize: 14 }}>
                {deployment.repo_full_name}
              </span>
            </div>
          </div>
          {(user.role === 'admin' || user.role === 'deployer') && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid rgba(248, 81, 73, 0.4)',
                background: deleting ? '#484f58' : 'rgba(248, 81, 73, 0.1)',
                color: deleting ? '#8b949e' : '#f85149',
                fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 14,
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
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 24,
        }}>
          <div>
            <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Ref</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f0f6fc', fontWeight: 500 }}>
              {deployment.ref}
            </div>
          </div>

          <div>
            <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Type</div>
            <div style={{ color: '#f0f6fc', textTransform: 'capitalize' }}>
              {deployment.ref_type}
            </div>
          </div>

          <div>
            <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Started</div>
            <div style={{ color: '#f0f6fc' }}>
              {new Date(deployment.started_at).toLocaleString()}
            </div>
          </div>

          {deployment.tunnel_url && (
            <div>
              <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Tunnel URL</div>
              <a
                href={deployment.tunnel_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#22d3ee',
                  textDecoration: 'none',
                }}
              >
                {deployment.tunnel_url} ↗
              </a>
            </div>
          )}

          {deployment.container_id && (
            <div>
              <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Container</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f0f6fc', fontSize: 13 }}>
                {deployment.container_id.substring(0, 12)}...
              </div>
            </div>
          )}

          {deployment.triggered_by_login && (
            <div>
              <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 4 }}>Triggered By</div>
              <div style={{ color: '#f0f6fc' }}>
                {deployment.triggered_by_login}
              </div>
            </div>
          )}
        </div>

        {deployment.error_message && (
          <div style={{
            marginTop: 20,
            padding: 16,
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.3)',
            borderRadius: 8,
          }}>
            <div style={{ color: '#f85149', fontWeight: 500, marginBottom: 4 }}>Error</div>
            <div style={{ color: '#c9d1d9', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
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
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
            Build Logs
          </h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px',
            borderRadius: 12,
            background: connected ? 'rgba(63, 185, 80, 0.15)' : 'rgba(139, 148, 158, 0.15)',
            color: connected ? '#3fb950' : '#8b949e',
            fontSize: 12,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: connected ? '#3fb950' : '#8b949e',
            }} />
            {connected ? 'Live' : 'Connecting...'}
          </div>
        </div>

        <div style={{ height: 500 }}>
          {logsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
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
