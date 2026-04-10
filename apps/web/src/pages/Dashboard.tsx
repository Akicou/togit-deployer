import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useRecentDeployments } from '../hooks/useDeployments';
import DeployBadge from '../components/DeployBadge';
import type { User, Stats, SystemStatus, Project } from '../types';

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
    const interval = setInterval(() => {
      loadStats();
      loadSystemStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadRepos() {
    try {
      const response = await api.get('/api/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      }
    } catch (error) {
      console.error('Failed to load repos:', error);
    }
  }

  async function loadProjectHealth() {
    if (user.role !== 'admin' && user.role !== 'deployer') return;
    try {
      const response = await api.get('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjectHealth(data.projects || []);
      }
    } catch (error) {
      console.error('Failed to load project health:', error);
    }
  }

  async function loadPendingRequests() {
    if (user.role !== 'admin') return;
    try {
      const response = await api.get('/api/access-requests');
      if (response.ok) {
        const data = await response.json();
        setPendingRequests(
          (data.access_requests || []).filter(
            (r: any) => r.status === 'pending'
          ).length
        );
      }
    } catch (error) {
      console.error('Failed to load pending requests:', error);
    }
  }

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
    { label: 'Total Repos', value: stats?.total_repos ?? 0, link: '/repositories' },
    { label: 'Active Deployments', value: stats?.active_deployments ?? 0 },
    { label: 'Failed Today', value: stats?.failed_today ?? 0 },
    { label: 'Tunnels Online', value: stats?.tunnels_online ?? 0 },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 40 }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1a1a1a', marginBottom: 8, letterSpacing: '-1px' }}>
          DASHBOARD
        </h1>
        <p style={{ color: '#666', fontWeight: 600, fontSize: 14 }}>
          Welcome back, {user.github_login}
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 40,
      }}>
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => stat.link && (window.location.href = stat.link)}
            style={{
              background: '#ffffff',
              border: '3px solid #1a1a1a',
              padding: 24,
              boxShadow: '4px 4px 0 #1a1a1a',
              cursor: stat.link ? 'pointer' : 'default',
            }}
          >
            <div style={{
              fontSize: 11,
              color: '#666',
              marginBottom: 8,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {stat.label}
            </div>
            <div style={{
              fontSize: 40,
              fontWeight: 800,
              color: '#1a1a1a',
              lineHeight: 1,
            }}>
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          background: '#ffffff',
          border: '3px solid #1a1a1a',
          padding: 28,
          marginBottom: 24,
          boxShadow: '4px 4px 0 #1a1a1a',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Quick Actions
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {(user.role === 'admin' || user.role === 'deployer') && (
            <Link
              to="/repositories"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 20,
                border: '2px solid #1a1a1a',
                background: '#f5f5f5',
                textDecoration: 'none',
                boxShadow: '2px 2px 0 #1a1a1a',
                transition: 'all 0.1s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(1px, 1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(0, 0)';
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a' }}>🚀</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>
                Deploy Service
              </span>
            </Link>
          )}

          <Link
            to="/repositories"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 20,
              border: '2px solid #1a1a1a',
              background: '#f5f5f5',
              textDecoration: 'none',
              boxShadow: '2px 2px 0 #1a1a1a',
              transition: 'all 0.1s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#1a1a1a';
              e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(1px, 1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
              e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(0, 0)';
            }}
          >
            <span style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a' }}>📊</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>
              View All Services
            </span>
          </Link>

          {(user.role === 'admin' || user.role === 'deployer') && stats?.failed_today > 0 && (
            <Link
              to="/logs"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 20,
                border: '2px solid #e67e22',
                background: '#fef5e8',
                textDecoration: 'none',
                boxShadow: '2px 2px 0 #e67e22',
                transition: 'all 0.1s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#e67e22';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = '1px 1px 0 #e67e22';
                e.currentTarget.style.transform = 'translate(1px, 1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#fef5e8';
                e.currentTarget.style.color = '#1a1a1a';
                e.currentTarget.style.boxShadow = '2px 2px 0 #e67e22';
                e.currentTarget.style.transform = 'translate(0, 0)';
              }}
            >
              <span style={{ fontSize: 24, fontWeight: 800, color: '#e67e22' }}>⚠️</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>
                {stats.failed_today} Failed Today
              </span>
            </Link>
          )}

          {user.role === 'admin' && pendingRequests > 0 && (
            <Link
              to="/settings"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 20,
                border: '2px solid #1a1a1a',
                background: '#f5f5f5',
                textDecoration: 'none',
                boxShadow: '2px 2px 0 #1a1a1a',
                transition: 'all 0.1s ease',
                position: 'relative',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(1px, 1px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(0, 0)';
              }}
            >
              <span style={{
                position: 'absolute',
                top: 10,
                right: 10,
                padding: '4px 10px',
                background: '#e67e22',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                borderRadius: 3,
              }}>
                {pendingRequests}
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a' }}>👥</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a' }}>
                Manage Access
              </span>
            </Link>
          )}
        </div>
      </motion.div>

      {/* Project Health Overview */}
      {projectHealth.length > 0 && (user.role === 'admin' || user.role === 'deployer') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 28,
            marginBottom: 24,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Project Health
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {projectHealth.map((project) => {
              const projectRepos = repos.filter((r: any) => r.project_id === project.id);
              const hasFailed = projectRepos.some((r: any) => r.last_deployment_status === 'failed');
              const hasPending = projectRepos.some((r: any) => r.last_deployment_status === 'pending' || r.last_deployment_status === 'building');

              return (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  style={{
                    padding: 16,
                    border: '2px solid #1a1a1a',
                    background: hasFailed ? '#fef5e8' : '#ffffff',
                    textDecoration: 'none',
                    boxShadow: '2px 2px 0 #1a1a1a',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f5f5f5';
                    e.currentTarget.style.transform = 'translate(1px, 1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = hasFailed ? '#fef5e8' : '#ffffff';
                    e.currentTarget.style.transform = 'translate(0, 0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a' }}>
                      {project.name}
                    </span>
                    {hasPending && (
                      <span style={{
                        padding: '4px 8px',
                        background: '#f5f5f5',
                        border: '2px solid #1a1a1a',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        Deploying
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 600, color: '#666' }}>
                    <span>{project.service_count || 0} services</span>
                    {hasFailed && (
                      <span style={{ color: '#e67e22', fontWeight: 700 }}>⚠️ Has failures</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Recent Deployments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 24,
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
              Recent Deployments
            </h2>
            <Link
              to="/repositories"
              style={{
                color: '#1a1a1a',
                textDecoration: 'underline',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              VIEW ALL →
            </Link>
          </div>

          {deploymentsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              Loading...
            </div>
          ) : deployments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              No deployments yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '3px solid #1a1a1a' }}>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Repository</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ref</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.slice(0, 10).map((deployment) => (
                    <tr
                      key={deployment.id}
                      style={{ borderBottom: '2px solid #1a1a1a' }}
                    >
                      <td style={{ padding: '14px 12px' }}>
                        <Link
                          to={`/repositories/${deployment.repo_id}`}
                          style={{
                            color: '#1a1a1a',
                            textDecoration: 'none',
                            fontWeight: 700,
                          }}
                        >
                          {deployment.repo_full_name}
                        </Link>
                      </td>
                      <td style={{ padding: '14px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#666' }}>
                        {deployment.ref.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '14px 12px' }}>
                        <DeployBadge status={deployment.status} />
                      </td>
                      <td style={{ padding: '14px 12px', fontSize: 13, color: '#666', fontWeight: 600 }}>
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
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 24,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            System Health
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 14,
              border: '2px solid #1a1a1a',
              background: '#ffffff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DockerIcon />
                <span style={{ fontSize: 14, fontWeight: 700 }}>Docker</span>
              </div>
              <div style={{
                padding: '4px 10px',
                border: '2px solid #1a1a1a',
                background: systemStatus?.docker === 'running' ? '#1a1a1a' : '#ffffff',
                color: systemStatus?.docker === 'running' ? '#ffffff' : '#1a1a1a',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {systemStatus?.docker === 'running' ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 14,
              border: '2px solid #1a1a1a',
              background: '#ffffff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DatabaseIcon />
                <span style={{ fontSize: 14, fontWeight: 700 }}>Database</span>
              </div>
              <div style={{
                padding: '4px 10px',
                border: '2px solid #1a1a1a',
                background: systemStatus?.database === 'connected' ? '#1a1a1a' : '#ffffff',
                color: systemStatus?.database === 'connected' ? '#ffffff' : '#1a1a1a',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {systemStatus?.database === 'connected' ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 14,
              border: '2px solid #1a1a1a',
              background: '#ffffff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TunnelIcon />
                <span style={{ fontSize: 14, fontWeight: 700 }}>Localtonet</span>
              </div>
              <div style={{
                padding: '4px 10px',
                border: '2px solid #1a1a1a',
                background: systemStatus?.localtonet === 'installed' ? '#1a1a1a' : '#ffffff',
                color: systemStatus?.localtonet === 'installed' ? '#ffffff' : '#1a1a1a',
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                {systemStatus?.localtonet === 'installed' ? 'ONLINE' : 'PENDING'}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function DockerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5">
      <path d="M8.5 2.5h7v7h-7v-7zM22 9.5h-5v5h5v-5zM1 9.5H0v5h1v-5zM16 2.5h5v5h-5v-5zM2.5 16h7v7h-7v-7z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function TunnelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
