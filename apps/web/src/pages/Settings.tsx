import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { User, Settings as SettingsType } from '../types';

interface SettingsProps {
  user: User;
}

export default function Settings({ user }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>({
    poll_interval_seconds: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    loadSettings();
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function loadSettings() {
    try {
      const response = await api.get('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const response = await api.get('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await api.patch('/api/settings', settings);
      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRole(userId: number, role: string) {
    try {
      const response = await api.patch(`/api/users/${userId}`, { role });
      if (response.ok) {
        loadUsers();
        setMessage({ type: 'success', text: 'Role updated successfully' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update role' });
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
        Loading settings...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
        You do not have permission to access settings.
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
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
          Settings
        </h1>
        <p style={{ color: '#8b949e' }}>
          Configure deployment scheduler and manage users
        </p>
      </motion.div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: 12,
            borderRadius: 8,
            marginBottom: 24,
            background: message.type === 'success' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)',
            color: message.type === 'success' ? '#3fb950' : '#f85149',
          }}
        >
          {message.text}
        </motion.div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* General Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc', marginBottom: 20 }}>
            General Settings
          </h2>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
              Poll Interval (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="3600"
              value={settings.poll_interval_seconds}
              onChange={(e) => setSettings({ ...settings, poll_interval_seconds: parseInt(e.target.value, 10) || 60 })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 14,
              }}
            />
            <p style={{ color: '#6e7681', fontSize: 12, marginTop: 6 }}>
              How often to check GitHub for new releases or commits
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: 6,
              border: 'none',
              background: saving ? '#484f58' : '#6366f1',
              color: 'white',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </motion.div>

        {/* Environment Info */}
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc', marginBottom: 20 }}>
            Environment
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <span style={{ color: '#8b949e' }}>Node Environment</span>
              <span style={{ color: '#f0f6fc' }}>{import.meta.env.MODE || 'development'}</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <span style={{ color: '#8b949e' }}>GitHub OAuth</span>
              <span style={{ color: import.meta.env.GITHUB_APP_CLIENT_ID ? '#3fb950' : '#f85149' }}>
                {import.meta.env.GITHUB_APP_CLIENT_ID ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <span style={{ color: '#8b949e' }}>Localtonet</span>
              <span style={{ color: import.meta.env.LOCALTONET_AUTH_TOKEN ? '#3fb950' : '#f85149' }}>
                {import.meta.env.LOCALTONET_AUTH_TOKEN ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: 12,
              background: '#0d1117',
              borderRadius: 8,
            }}>
              <span style={{ color: '#8b949e' }}>Database</span>
              <span style={{ color: '#3fb950' }}>Connected</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* User Management */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc', marginBottom: 20 }}>
          User Management
        </h2>

        {users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
            No users yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363d' }}>
                  <th style={{ textAlign: 'left', padding: '12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>
                    User
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>
                    Role
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>
                    Joined
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px', color: '#8b949e', fontSize: 12, fontWeight: 500 }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#30363d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          color: '#f0f6fc',
                        }}>
                          {u.github_login.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: '#f0f6fc', fontWeight: 500 }}>
                          {u.github_login}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        disabled={u.id === user.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #30363d',
                          background: '#0d1117',
                          color: '#f0f6fc',
                          fontSize: 13,
                          cursor: u.id === user.id ? 'not-allowed' : 'pointer',
                          opacity: u.id === user.id ? 0.5 : 1,
                        }}
                      >
                        <option value="admin">Admin</option>
                        <option value="deployer">Deployer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td style={{ padding: '12px', color: '#8b949e', fontSize: 13 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {u.id === user.id && (
                        <span style={{ color: '#6e7681', fontSize: 12 }}>Current user</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
