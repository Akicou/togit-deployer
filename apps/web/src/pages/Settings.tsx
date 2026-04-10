import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { User, Settings as SettingsType, AccessRequest } from '../types';

interface SystemConfig {
  github_oauth: boolean;
  localtonet: boolean;
  admin_github_login: boolean;
}

interface SettingsProps {
  user: User;
}

export default function Settings({ user }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>({
    poll_interval_seconds: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [savingPat, setSavingPat] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'access'>('general');
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    loadSettings();
    loadSystemConfig();
    if (isAdmin) {
      loadUsers();
      loadAccessRequests();
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

  async function loadAccessRequests() {
    try {
      const response = await api.get('/api/access-requests');
      if (response.ok) {
        const data = await response.json();
        setAccessRequests(data.access_requests || []);
      }
    } catch (error) {
      console.error('Failed to load access requests:', error);
    }
  }

  async function loadSystemConfig() {
    try {
      const response = await api.get('/api/system/config');
      if (response.ok) {
        const data = await response.json();
        setSystemConfig(data.config);
      }
    } catch (error) {
      console.error('Failed to load system config:', error);
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
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePat() {
    if (!patInput.trim()) return;
    setSavingPat(true);
    setMessage(null);
    try {
      const response = await api.patch('/api/settings', { github_pat: patInput.trim() });
      if (response.ok) {
        setSettings((s) => ({ ...s, github_pat_set: true }));
        setPatInput('');
        setMessage({ type: 'success', text: 'GitHub PAT saved' });
      } else {
        setMessage({ type: 'error', text: 'Failed to save PAT' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save PAT' });
    } finally {
      setSavingPat(false);
    }
  }

  async function handleClearPat() {
    setSavingPat(true);
    setMessage(null);
    try {
      const response = await api.patch('/api/settings', { github_pat: null });
      if (response.ok) {
        setSettings((s) => ({ ...s, github_pat_set: false }));
        setPatInput('');
        setMessage({ type: 'success', text: 'GitHub PAT cleared' });
      } else {
        setMessage({ type: 'error', text: 'Failed to clear PAT' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear PAT' });
    } finally {
      setSavingPat(false);
    }
  }

  async function handleUpdateRole(userId: number, role: string) {
    try {
      const response = await api.patch(`/api/users/${userId}`, { role });
      if (response.ok) {
        loadUsers();
        setMessage({ type: 'success', text: 'Role updated' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update role' });
    }
  }

  async function handleAccessAction(userId: number, action: string) {
    try {
      let response: Response;
      if (action === 'kick') {
        response = await api.post(`/api/access-requests/${userId}/kick`);
      } else if (action === 'unban') {
        response = await api.post(`/api/access-requests/${userId}/unban`);
      } else {
        response = await api.patch(`/api/access-requests/${userId}`, { status: action });
      }
      if (response.ok) {
        loadUsers();
        loadAccessRequests();
        setMessage({ type: 'success', text: `User ${action} successful` });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.error || `Failed to ${action} user` });
      }
    } catch {
      setMessage({ type: 'error', text: 'Action failed' });
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

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '12px 20px',
    border: '3px solid #1a1a1a',
    background: active ? '#1a1a1a' : '#ffffff',
    color: active ? '#ffffff' : '#1a1a1a',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    boxShadow: active ? '4px 4px 0 #1a1a1a' : '2px 2px 0 #1a1a1a',
    transition: 'all 0.1s ease',
  });

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
        style={{ marginBottom: 32 }}
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        <button style={tabStyle(activeTab === 'general')} onClick={() => setActiveTab('general')}>General</button>
        <button style={tabStyle(activeTab === 'users')} onClick={() => setActiveTab('users')}>Users</button>
        <button style={tabStyle(activeTab === 'access')} onClick={() => setActiveTab('access')}>
          Access Requests{accessRequests.filter(a => a.status === 'pending').length > 0 && (
            <span style={{
              marginLeft: 8,
              padding: '2px 8px',
              background: '#1a1a1a',
              color: '#ffffff',
              fontSize: 10,
            }}>
              {accessRequests.filter(a => a.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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

            <div style={{ marginBottom: 24, borderTop: '2px solid #e5e5e5', paddingTop: 20 }}>
              <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                GitHub PAT (Fallback Token)
              </label>
              {settings.github_pat_set && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', border: '2px solid #27ae60', background: '#f0fff4' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#27ae60', flex: 1 }}>Token configured</span>
                  <button
                    onClick={handleClearPat}
                    disabled={savingPat}
                    style={{ padding: '4px 10px', border: '2px solid #c0392b', background: 'transparent', color: '#c0392b', fontWeight: 800, cursor: 'pointer', fontSize: 11, textTransform: 'uppercase' }}
                  >
                    Clear
                  </button>
                </div>
              )}
              <input
                type="password"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                placeholder={settings.github_pat_set ? 'Paste new token to replace...' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                style={inputStyle}
              />
              <p style={{ color: '#888', fontSize: 11, marginTop: 8, fontWeight: 600 }}>
                Used as a fallback when a user's OAuth token is missing or invalid. Needs <code>repo</code> scope.
              </p>
              <button
                onClick={handleSavePat}
                disabled={savingPat || !patInput.trim()}
                style={{
                  marginTop: 10,
                  width: '100%',
                  padding: '10px',
                  border: '2px solid #1a1a1a',
                  background: savingPat || !patInput.trim() ? '#f5f5f5' : '#1a1a1a',
                  color: savingPat || !patInput.trim() ? '#999' : '#ffffff',
                  fontWeight: 800,
                  cursor: savingPat || !patInput.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {savingPat ? 'Saving...' : 'Save PAT'}
              </button>
            </div>

            <button
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
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
              }}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </motion.div>

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
              Environment
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, border: '2px solid #1a1a1a', background: '#f5f5f5',
              }}>
                <span style={{ color: '#666', fontWeight: 700 }}>GitHub OAuth</span>
                <span style={{ color: systemConfig?.github_oauth ? '#1a1a1a' : '#cc0000', fontWeight: 700 }}>
                  {systemConfig?.github_oauth ? '✅ Configured' : '❌ Not Configured'}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, border: '2px solid #1a1a1a', background: '#f5f5f5',
              }}>
                <span style={{ color: '#666', fontWeight: 700 }}>Localtonet Token</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: systemConfig?.localtonet ? '#1a1a1a' : '#cc0000', fontWeight: 700 }}>
                    {systemConfig?.localtonet ? '✅ Configured' : '❌ Not Configured'}
                  </span>
                  {systemConfig?.localtonet && (
                    <TestConnectionButton />
                  )}
                </div>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, border: '2px solid #1a1a1a', background: '#f5f5f5',
              }}>
                <span style={{ color: '#666', fontWeight: 700 }}>Admin User</span>
                <span style={{ color: systemConfig?.admin_github_login ? '#1a1a1a' : '#cc0000', fontWeight: 700 }}>
                  {systemConfig?.admin_github_login ? '✅ Configured' : '❌ Not Configured'}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: 12, border: '2px solid #1a1a1a', background: '#f5f5f5',
              }}>
                <span style={{ color: '#666', fontWeight: 700 }}>Database</span>
                <span style={{ color: '#1a1a1a', fontWeight: 700 }}>✅ Connected</span>
              </div>
            </div>
            
            {/* Localtonet Info */}
            {!systemConfig?.localtonet && (
              <div style={{
                marginTop: 20,
                padding: 16,
                border: '2px dashed #cc0000',
                background: '#fff5f5',
              }}>
                <p style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  ⚠️ Localtonet token not configured
                </p>
                <p style={{ color: '#666', fontWeight: 600, fontSize: 12, marginBottom: 12 }}>
                  Deployments require Localtonet for tunneling. Add LOCALTONET_AUTH_TOKEN to your .env file:
                </p>
                <ol style={{ color: '#666', fontWeight: 600, fontSize: 11, paddingLeft: 20, margin: 0 }}>
                  <li>Get your token from <a href="https://localtonet.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1a1a1a', textDecoration: 'underline' }}>localtonet.com</a></li>
                  <li>Add to .env: <code style={{ background: '#1a1a1a', color: '#fff', padding: '2px 6px', borderRadius: 3 }}>LOCALTONET_AUTH_TOKEN=your_token_here</code></li>
                  <li>Restart the server</li>
                </ol>
              </div>
            )}
            
            {!systemConfig?.github_oauth && (
              <div style={{
                marginTop: 20,
                padding: 16,
                border: '2px dashed #cc0000',
                background: '#fff5f5',
              }}>
                <p style={{ color: '#cc0000', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  ⚠️ GitHub OAuth not configured
                </p>
                <p style={{ color: '#666', fontWeight: 600, fontSize: 12, marginBottom: 12 }}>
                  Add these to your .env file:
                </p>
                <code style={{ display: 'block', background: '#1a1a1a', color: '#fff', padding: 8, borderRadius: 3, fontSize: 11, fontWeight: 600 }}>
                  GITHUB_APP_CLIENT_ID=your_client_id<br />
                  GITHUB_APP_CLIENT_SECRET=your_client_secret
                </code>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 28,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            All Users ({users.length})
          </h2>
          {users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>No users yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '3px solid #1a1a1a' }}>
                  {['User', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '14px 12px', color: '#1a1a1a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '2px solid #1a1a1a' }}>
                    <td style={{ padding: '16px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, border: '2px solid #1a1a1a', background: '#ffffff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, color: '#1a1a1a', fontSize: 14,
                        }}>
                          {u.github_login.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ color: '#1a1a1a', fontWeight: 700 }}>{u.github_login}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        disabled={u.id === user.id}
                        style={{ ...selectStyle, cursor: u.id === user.id ? 'not-allowed' : 'pointer' }}
                      >
                        <option value="admin">Admin</option>
                        <option value="deployer">Deployer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      <span style={{
                        padding: '4px 10px',
                        border: '2px solid #1a1a1a',
                        background: u.access_level === 'approved' ? '#1a1a1a' : '#ffffff',
                        color: u.access_level === 'approved' ? '#ffffff' : '#1a1a1a',
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}>
                        {u.access_level}
                      </span>
                    </td>
                    <td style={{ padding: '16px 12px', color: '#666', fontSize: 13, fontWeight: 600 }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '16px 12px' }}>
                      {u.id === user.id ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase' }}>You</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {u.access_level === 'approved' && (
                            <button onClick={() => handleAccessAction(u.id, 'blocked')} style={{
                              padding: '4px 10px', border: '2px solid #1a1a1a', background: '#ffffff',
                              color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 10,
                              textTransform: 'uppercase',
                            }}>Kick</button>
                          )}
                          {u.access_level === 'banned' && (
                            <button onClick={() => handleAccessAction(u.id, 'unban')} style={{
                              padding: '4px 10px', border: '2px solid #1a1a1a', background: '#1a1a1a',
                              color: '#ffffff', fontWeight: 800, cursor: 'pointer', fontSize: 10,
                              textTransform: 'uppercase',
                            }}>Unban</button>
                          )}
                          {u.access_level === 'blocked' && (
                            <>
                              <button onClick={() => handleAccessAction(u.id, 'approved')} style={{
                                padding: '4px 10px', border: '2px solid #1a1a1a', background: '#ffffff',
                                color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 10,
                                textTransform: 'uppercase',
                              }}>Approve</button>
                              <button onClick={() => handleAccessAction(u.id, 'banned')} style={{
                                padding: '4px 10px', border: '2px solid #1a1a1a', background: '#ffffff',
                                color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 10,
                                textTransform: 'uppercase',
                              }}>Ban</button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>
      )}

      {/* Access Requests Tab */}
      {activeTab === 'access' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: '#ffffff',
            border: '3px solid #1a1a1a',
            padding: 28,
            boxShadow: '4px 4px 0 #1a1a1a',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Access Requests
          </h2>
          {accessRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              No access requests
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accessRequests.map((ar) => (
                <div key={ar.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 16,
                  border: '2px solid #1a1a1a',
                  background: ar.status === 'pending' ? '#ffffff' : '#f5f5f5',
                  boxShadow: '2px 2px 0 #1a1a1a',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, border: '2px solid #1a1a1a', background: '#ffffff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, color: '#1a1a1a', fontSize: 14,
                    }}>
                      {ar.github_login.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1a1a1a' }}>{ar.github_login}</div>
                      <div style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>
                        {new Date(ar.requested_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 10px',
                      border: '2px solid #1a1a1a',
                      background: ar.status === 'approved' ? '#1a1a1a' : '#ffffff',
                      color: ar.status === 'approved' ? '#ffffff' : '#1a1a1a',
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}>
                      {ar.status}
                    </span>
                    {ar.status === 'pending' && (
                      <>
                        <button onClick={() => handleAccessAction(ar.user_id, 'approved')} style={{
                          padding: '6px 12px', border: '2px solid #1a1a1a', background: '#1a1a1a',
                          color: '#ffffff', fontWeight: 800, cursor: 'pointer', fontSize: 11,
                          textTransform: 'uppercase',
                        }}>Approve</button>
                        <button onClick={() => handleAccessAction(ar.user_id, 'blocked')} style={{
                          padding: '6px 12px', border: '2px solid #1a1a1a', background: '#ffffff',
                          color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 11,
                          textTransform: 'uppercase',
                        }}>Block</button>
                        <button onClick={() => handleAccessAction(ar.user_id, 'banned')} style={{
                          padding: '6px 12px', border: '2px solid #1a1a1a', background: '#ffffff',
                          color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 11,
                          textTransform: 'uppercase',
                        }}>Ban</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function TestConnectionButton() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    activeTunnelsCount?: number;
  } | null>(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const response = await api.post('/api/tunnels/test');
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: 'Network error' });
    } finally {
      setTesting(false);
    }
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: '2px solid #1a1a1a',
    background: testing ? '#f5f5f5' : '#1a1a1a',
    color: testing ? '#666' : '#ffffff',
    fontSize: 9,
    fontWeight: 800,
    cursor: testing ? 'not-allowed' : 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={handleTest} disabled={testing} style={buttonStyle}>
        {testing ? 'Testing...' : 'Test Connection'}
      </button>
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: result.success ? '#00aa00' : '#cc0000',
          }}>
            {result.success ? '✅ API Connected' : `❌ ${result.error}`}
          </span>
          {result.success && result.activeTunnelsCount !== undefined && (
            <span style={{
              fontSize: 8,
              fontWeight: 600,
              color: '#666',
            }}>
              📊 {result.activeTunnelsCount} active tunnel{result.activeTunnelsCount !== 1 ? 's' : ''} on Localtonet
            </span>
          )}
        </div>
      )}
    </div>
  );
}
