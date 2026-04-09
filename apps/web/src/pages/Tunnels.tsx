import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { ActiveTunnel } from '../types';

export default function Tunnels() {
  const [tunnels, setTunnels] = useState<ActiveTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadTunnels();
  }, []);

  async function loadTunnels() {
    try {
      const response = await api.get('/api/tunnels');
      if (response.ok) {
        const data = await response.json();
        setTunnels(data.tunnels);
      }
    } catch (error) {
      console.error('Failed to load tunnels:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleStopTunnel(deploymentId: number) {
    if (!confirm('Stop this tunnel? This will mark the deployment as rolled back.')) return;

    setStopping(deploymentId);
    try {
      const response = await api.post(`/api/tunnels/${deploymentId}/stop`);
      if (response.ok) {
        setMessage({ type: 'success', text: 'Tunnel stopped successfully' });
        loadTunnels();
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || 'Failed to stop tunnel' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to stop tunnel' });
    } finally {
      setStopping(null);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '3px solid #1a1a1a',
    padding: 20,
    boxShadow: '4px 4px 0 #1a1a1a',
    transition: 'all 0.1s ease',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '8px 16px',
    border: '2px solid #1a1a1a',
    background: '#1a1a1a',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    boxShadow: '2px 2px 0 #1a1a1a',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600 }}>
        Loading tunnels...
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 32 }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1a1a1a', marginBottom: 8, letterSpacing: '-1px' }}>
          ACTIVE TUNNELS
        </h1>
        <p style={{ color: '#666', fontWeight: 600, fontSize: 14 }}>
          {tunnels.length} tunnel{tunnels.length !== 1 ? 's' : ''} currently running
        </p>
      </motion.div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '16px 20px',
            border: '3px solid #1a1a1a',
            marginBottom: 24,
            background: '#ffffff',
            color: '#1a1a1a',
            fontWeight: 700,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          {message.text}
        </motion.div>
      )}

      {tunnels.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            textAlign: 'center',
            padding: 60,
            background: '#ffffff',
            border: '3px dashed #1a1a1a',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="1.5" style={{ margin: '0 auto', opacity: 0.3 }}>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h3 style={{ color: '#1a1a1a', marginBottom: 8, fontWeight: 800, fontSize: 18, textTransform: 'uppercase' }}>
            No Active Tunnels
          </h3>
          <p style={{ color: '#666', fontWeight: 600 }}>
            Deployed applications will appear here
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {tunnels.map((tunnel, index) => (
            <motion.div
              key={tunnel.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              style={cardStyle}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      border: '2px solid #1a1a1a',
                      background: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a' }}>
                        {tunnel.repo_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#666', fontWeight: 700, marginTop: 2 }}>
                        Tunnel ID: <span style={{ fontFamily: 'monospace', color: '#1a1a1a' }}>{tunnel.tunnel_id}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#666', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                        Tunnel URL
                      </div>
                      <a
                        href={tunnel.tunnel_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 13,
                          color: '#1a1a1a',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          fontFamily: 'monospace',
                        }}
                      >
                        {tunnel.tunnel_url} ↗
                      </a>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#666', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                        Local Port
                      </div>
                      <div style={{ fontSize: 13, color: '#1a1a1a', fontWeight: 700, fontFamily: 'monospace' }}>
                        :{tunnel.tunnel_port}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#666', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                        Started
                      </div>
                      <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>
                        {new Date(tunnel.started_at).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#666', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                        Status
                      </div>
                      <span style={{
                        padding: '4px 10px',
                        border: '2px solid #1a1a1a',
                        background: '#1a1a1a',
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}>
                        ● Running
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href={tunnel.tunnel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...buttonStyle,
                      background: '#ffffff',
                      color: '#1a1a1a',
                      textAlign: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    Open ↗
                  </a>
                  <button
                    onClick={() => handleStopTunnel(tunnel.deployment_id)}
                    disabled={stopping === tunnel.deployment_id}
                    style={{
                      ...buttonStyle,
                      background: stopping === tunnel.deployment_id ? '#f5f5f5' : '#cc0000',
                      color: stopping === tunnel.deployment_id ? '#666' : '#ffffff',
                      cursor: stopping === tunnel.deployment_id ? 'not-allowed' : 'pointer',
                      borderColor: '#cc0000',
                    }}
                  >
                    {stopping === tunnel.deployment_id ? 'Stopping...' : 'Stop Tunnel'}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
