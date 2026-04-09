import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useRecentDeployments } from '../hooks/useDeployments';
import DeployBadge from '../components/DeployBadge';
import AnimatedStatus from '../components/AnimatedStatus';
import type { User, Stats, SystemStatus } from '../types';

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const { deployments, loading: deploymentsLoading } = useRecentDeployments();
  const [stats, setStats] = useState<Stats | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    loadStats();
    loadSystemStatus();
    const interval = setInterval(() => {
      loadStats();
      loadSystemStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadStats() {
    try {
      const response = await api.get('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function loadSystemStatus() {
    try {
      const response = await api.get('/api/system/status');
      if (response.ok) {
        const data = await response.json();
        setSystemStatus(data.status);
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  }

  const statCards = [
    { label: 'Total Repos', value: stats?.total_repos ?? 0, color: '#6366f1' },
    { label: 'Active Deployments', value: stats?.active_deployments ?? 0, color: '#3fb950' },
    { label: 'Failed Today', value: stats?.failed_today ?? 0, color: '#f85149' },
    { label: 'Tunnels Online', value: stats?.tunnels_online ?? 0, color: '#22d3ee' },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 32 }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
          Dashboard
        </h1>
        <p style={{ color: '#8b949e' }}>
          Welcome back, {user.github_login}
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 32,
      }}>
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{
              fontSize: 13,
              color: '#8b949e',
              marginBottom: 8,
            }}>
              {stat.label}
            </div>
            <div style={{
              fontSize: 32,
              fontWeight: 700,
              color: stat.color,
            }}>
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Recent Deployments */}
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
              Recent Deployments
            </h2>
            <Link
              to="/repositories"
              style={{
                color: '#6366f1',
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              View all →
            </Link>
          </div>

          {deploymentsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
              Loading...
            </div>
          ) : deployments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
              No deployments yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #30363d' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>Repository</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>Ref</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.slice(0, 10).map((deployment) => (
                    <tr
                      key={deployment.id}
                      style={{ borderBottom: '1px solid #21262d' }}
                    >
                      <td style={{ padding: '12px' }}>
                        <Link
                          to={`/repositories/${deployment.repo_id}`}
                          style={{
                            color: '#f0f6fc',
                            textDecoration: 'none',
                            fontWeight: 500,
                          }}
                        >
                          {deployment.repo_full_name}
                        </Link>
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#8b949e' }}>
                        {deployment.ref.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '12px' }}>
                        <DeployBadge status={deployment.status} />
                      </td>
                      <td style={{ padding: '12px', fontSize: 13, color: '#8b949e' }}>
                        {new Date(deployment.started_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* System Health */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc', marginBottom: 16 }}>
            System Health
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DockerIcon />
                <span style={{ fontSize: 14 }}>Docker</span>
              </div>
              <AnimatedStatus
                status={systemStatus?.docker === 'running' ? 'running' : 'failed'}
                size={20}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DatabaseIcon />
                <span style={{ fontSize: 14 }}>Database</span>
              </div>
              <AnimatedStatus
                status={systemStatus?.database === 'connected' ? 'running' : 'failed'}
                size={20}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TunnelIcon />
                <span style={{ fontSize: 14 }}>Localtonet</span>
              </div>
              <AnimatedStatus
                status={systemStatus?.localtonet === 'installed' ? 'running' : 'pending'}
                size={20}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function DockerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2496ed" strokeWidth="2">
      <path d="M8.5 2.5h7v7h-7v-7zM22 9.5h-5v5h5v-5zM1 9.5H0v5h1v-5zM16 2.5h5v5h-5v-5zM2.5 16h7v7h-7v-7z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#336791" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function TunnelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
