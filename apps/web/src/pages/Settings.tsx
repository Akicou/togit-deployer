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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '2px solid #1a1a1a',
    background: '#f5f5f5',
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
    fontFamily: 'inherit',
  };

  const selectStyle: React.CSSProperties = {
    padding: '10px 14px',
    border: '2px solid #1a1a1a',
    background: '#f5f5f5',
    color: '#1a1a1a',
    fontSize: 13,
    fontWeight: 700,
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px',
    border: '3px solid #1a1a1a',
    background: saving ? '#f5f5f5' : '#1a1a1a',
    color: saving ? '#666' : '#ffffff',
    fontWeight: 800,
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    boxShadow: saving ? '1px 1px 0 #1a1a1a' : '4px 4px 0 #1a1a1a',
    transition: 'all 0.1s ease',
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600 }}>
        Loading settings...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600 }}>
        You do not have permission to access settings.
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 40 }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1a1a1a', marginBottom: 8, letterSpacing: '-1px' }}>
          SETTINGS
        </h1>
        <p style={{ color: '#666', fontWeight: 600, fontSize: 14 }}>
          Configure deployment scheduler and manage users
        </p>
      </motion.div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '16px 20px',
            border: '3px solid #1a1a1a',
            marginBottom: 30,
            background: message.type === 'success' ? '#ffffff' : '#f5f5f5',
            color: message.type === 'success' ? '#1a1a1a' : '#1a1a1a',
            fontWeight: 700,
            boxShadow: '4px 4px 0 #1a1a1a',
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
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 28,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            General Settings
          </h2>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Poll Interval (seconds)
            </label>
            <input
              type="number"
              min="10"
              max="3600"
              value={settings.poll_interval_seconds}
              onChange={(e) => setSettings({ ...settings, poll_interval_seconds: parseInt(e.target.value, 10) || 60 })}
              style={inputStyle}
            />
            <p style={{ color: '#888', fontSize: 11, marginTop: 8, fontWeight: 600 }}>
              How often to check GitHub for new releases or commits
            </p>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            style={buttonStyle}
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
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 28,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Environment
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '2px solid #1a1a1a',
              background: '#f5f5f5',
            }}>
              <span style={{ color: '#666', fontWeight: 700 }}>Node Environment</span>
              <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{import.meta.env.MODE || 'development'}</span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '2px solid #1a1a1a',
              background: '#f5f5f5',
            }}>
              <span style={{ color: '#666', fontWeight: 700 }}>GitHub OAuth</span>
              <span style={{ color: import.meta.env.GITHUB_APP_CLIENT_ID ? '#1a1a1a' : '#666', fontWeight: 700 }}>
                {import.meta.env.GITHUB_APP_CLIENT_ID ? 'Configured' : 'Not Configured'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '2px solid #1a1a1a',
              background: '#f5f5f5',
            }}>
              <span style={{ color: '#666', fontWeight: 700 }}>Localtonet</span>
              <span style={{ color: import.meta.env.LOCALTONET_AUTH_TOKEN ? '#1a1a1a' : '#666', fontWeight: 700 }}>
                {import.meta.env.LOCALTONET_AUTH_TOKEN ? 'Configured' : 'Not Configured'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 12,
              border: '2px solid #1a1a1a',
              background: '#f5f5f5',
            }}>
              <span style={{ color: '#666', fontWeight: 700 }}>Database</span>
              <span style={{ color: '#1a1a1a', fontWeight: 700 }}>Connected</span>
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
          background: '#ffffff',
          border: '3px solid #1a1a1a',
          padding: 28,
          marginBottom: 24,
          boxShadow: '4px 4px 0 #1a1a1a',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          User Management
        </h2>

        {users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
            No users yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '3px solid #1a1a1a' }}>
                  <th style={{ textAlign: 'left', padding: '14px 12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    User
                  </th>
                  <th style={{ textAlign: 'left', padding: '14px 12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Role
                  </th>
                  <th style={{ textAlign: 'left', padding: '14px 12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Joined
                  </th>
                  <th style={{ textAlign: 'left', padding: '14px 12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '2px solid #1a1a1a' }}>
                    <td style={{ padding: '16px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          border: '2px solid #1a1a1a',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          color: '#1a1a1a',
                          fontSize: 14,
                        }}>
                          {u.github_login.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: '#1a1a1a', fontWeight: 700 }}>
                          {u.github_login}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        disabled={u.id === user.id}
                        style={{
                          ...selectStyle,
                          cursor: u.id === user.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <option value="admin">Admin</option>
                        <option value="deployer">Deployer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px 12px', color: '#666', fontSize: 13, fontWeight: 600 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      {u.id === user.id && (
                        <span style={{ color: '#1a1a1a', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Current
                        </span>
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
