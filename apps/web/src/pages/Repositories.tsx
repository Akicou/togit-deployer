import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import RepoCard from '../components/RepoCard';
import DeployBadge from '../components/DeployBadge';
import { useDeployments } from '../hooks/useDeployments';
import type { User, Repository } from '../types';

interface RepositoriesProps {
  user: User;
}

export default function Repositories({ user }: RepositoriesProps) {
  const { id } = useParams();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState<{ repoId: number; repoName: string } | null>(null);
  const [deployingRepo, setDeployingRepo] = useState<number | null>(null);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [envExample, setEnvExample] = useState<Record<string, string> | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(false);

  const canManage = user.role === 'admin' || user.role === 'deployer';

  useEffect(() => {
    loadRepos();
  }, []);

  async function loadRepos() {
    try {
      const response = await api.get('/api/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos);
      }
    } catch (error) {
      console.error('Failed to load repos:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeployClick(repoId: number, repoName: string) {
    setEnvVars({});
    setEnvExample(null);
    setLoadingEnv(true);
    setShowDeployModal({ repoId, repoName });
    
    // Try to fetch .env.example
    try {
      const response = await api.get(`/api/repos/${repoId}/env-example`);
      if (response.ok) {
        const data = await response.json();
        if (data.env_example) {
          setEnvExample(data.env_example);
          setEnvVars(data.env_example);
        }
      }
    } catch (error) {
      console.error('Failed to load env example:', error);
    } finally {
      setLoadingEnv(false);
    }
  }

  async function handleDeployConfirm() {
    if (!showDeployModal) return;
    setDeployingRepo(showDeployModal.repoId);
    try {
      const response = await api.post(`/api/repos/${showDeployModal.repoId}/deploy`, {
        env_vars: envVars,
      });
      if (response.ok) {
        await loadRepos();
        setShowDeployModal(null);
      }
    } catch (error) {
      console.error('Deploy failed:', error);
    } finally {
      setDeployingRepo(null);
    }
  }

  if (id) {
    const repo = repos.find((r) => r.id === parseInt(id, 10));
    return repo ? (
      <RepoDetail repo={repo} user={user} onRefresh={loadRepos} />
    ) : (
      <div style={{ color: '#666', fontWeight: 600 }}>Loading...</div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 40,
        }}
      >
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1a1a1a', marginBottom: 8, letterSpacing: '-1px' }}>
            REPOSITORIES
          </h1>
          <p style={{ color: '#666', fontWeight: 600, fontSize: 14 }}>
            {repos.length} {repos.length === 1 ? 'repository' : 'repositories'} configured
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              border: '3px solid #1a1a1a',
              background: '#1a1a1a',
              color: '#ffffff',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 13,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '6px 6px 0 #1a1a1a',
              transition: 'all 0.1s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(3px, 3px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(0, 0)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Repository
          </button>
        )}
      </motion.div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 700 }}>
          Loading repositories...
        </div>
      ) : repos.length === 0 ? (
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
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>
          <h3 style={{ color: '#1a1a1a', marginBottom: 8, fontWeight: 800, fontSize: 20, textTransform: 'uppercase' }}>No repositories yet</h3>
          <p style={{ color: '#666', marginBottom: 28, fontWeight: 600 }}>
            Add a GitHub repository to start deploying
          </p>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '14px 28px',
                border: '3px solid #1a1a1a',
                background: '#1a1a1a',
                color: '#ffffff',
                fontWeight: 800,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '4px 4px 0 #1a1a1a',
                transition: 'all 0.1s ease',
              }}
            >
              Add Repository
            </button>
          )}
        </motion.div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 20,
        }}>
          {repos.map((repo, index) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <RepoCard
                repo={repo}
                canDeploy={canManage}
                onDeploy={(id, name) => handleDeployClick(id, name)}
              />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <AddRepoModal
            onClose={() => setShowAddModal(false)}
            onAdd={loadRepos}
          />
        )}
        {showDeployModal && (
          <DeployModal
            showDeployModal={showDeployModal}
            onClose={() => setShowDeployModal(null)}
            onDeploy={handleDeployConfirm}
            envVars={envVars}
            setEnvVars={setEnvVars}
            envExample={envExample}
            loadingEnv={loadingEnv}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function RepoDetail({ repo, user, onRefresh }: { repo: Repository; user: User; onRefresh: () => void }) {
  const { deployments, loading } = useDeployments(repo.id);
  const [showDeployModal, setShowDeployModal] = useState<{ repoId: number; repoName: string } | null>(null);
  const [deployEnvVars, setDeployEnvVars] = useState<Record<string, string>>({});
  const [envExample, setEnvExample] = useState<Record<string, string> | null>(null);
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [config, setConfig] = useState({
    root_path: repo.root_path,
    deploy_mode: repo.deploy_mode,
    watch_branch: repo.watch_branch ?? 'main',
    enabled: repo.enabled,
  });
  const [envVars, setEnvVars] = useState<Record<string, string>>(repo.deployment_env_vars || {});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);

  async function handleDeployConfirm() {
    if (!showDeployModal) return;
    setDeploying(true);
    try {
      await api.post(`/api/repos/${showDeployModal.repoId}/deploy`, {
        env_vars: deployEnvVars,
      });
      setShowDeployModal(null);
      onRefresh();
    } catch (error) {
      console.error('Deploy failed:', error);
    } finally {
      setDeploying(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/repos/${repo.id}`, { ...config, deployment_env_vars: envVars });
      onRefresh();
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link
          to="/repositories"
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
          ← Back
        </Link>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 36,
        }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#1a1a1a', marginBottom: 12, letterSpacing: '-1px' }}>
              {repo.full_name}
            </h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <DeployBadge status={repo.last_deployment_status || 'never'} />
              {repo.last_tunnel_url && (
                <a
                  href={repo.last_tunnel_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '6px 12px',
                    border: '2px solid #1a1a1a',
                    background: '#1a1a1a',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
                    textDecoration: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    boxShadow: '2px 2px 0 #1a1a1a',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  {repo.last_tunnel_url}
                </a>
              )}
            </div>
          </div>

          {(user.role === 'admin' || user.role === 'deployer') && (() => {
            const isDeploying = repo.last_deployment_status === 'pending' || repo.last_deployment_status === 'building';
            return (
              <button
                onClick={async () => {
                  if (!isDeploying) {
                    setDeployEnvVars({});
                    setEnvExample(null);
                    setLoadingEnv(true);
                    setShowDeployModal({ repoId: repo.id, repoName: repo.full_name });
                    try {
                      const response = await api.get(`/api/repos/${repo.id}/env-example`);
                      if (response.ok) {
                        const data = await response.json();
                        if (data.env_example) {
                          setEnvExample(data.env_example);
                          setDeployEnvVars(data.env_example);
                        }
                      }
                    } catch (error) {
                      console.error('Failed to load env example:', error);
                    } finally {
                      setLoadingEnv(false);
                    }
                  }
                }}
                disabled={isDeploying}
                style={{
                  padding: '14px 24px',
                  border: '3px solid #1a1a1a',
                  background: isDeploying ? '#f5f5f5' : '#1a1a1a',
                  color: isDeploying ? '#666' : '#ffffff',
                  fontWeight: 800,
                  cursor: isDeploying ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  boxShadow: isDeploying ? '2px 2px 0 #1a1a1a' : '6px 6px 0 #1a1a1a',
                  transition: 'all 0.1s ease',
                }}
              >
                {isDeploying ? 'Deploying...' : 'Deploy Now'}
              </button>
            );
          })()}
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Config Panel */}
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
            Configuration
          </h2>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Root Path
            </label>
            <input
              type="text"
              value={config.root_path}
              onChange={(e) => setConfig({ ...config, root_path: e.target.value })}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #1a1a1a',
                background: '#f5f5f5',
                color: '#1a1a1a',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
              }}
              placeholder="/"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Deploy Mode
            </label>
            <select
              value={config.deploy_mode}
              onChange={(e) => setConfig({ ...config, deploy_mode: e.target.value as 'release' | 'commit' })}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #1a1a1a',
                background: '#f5f5f5',
                color: '#1a1a1a',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="release">Release — deploy on new tags</option>
              <option value="commit">Commit — deploy on new commits</option>
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Watch Branch
            </label>
            <input
              type="text"
              value={config.watch_branch}
              onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })}
              style={{
                width: '100%',
                padding: '12px 14px',
                border: '2px solid #1a1a1a',
                background: '#f5f5f5',
                color: '#1a1a1a',
                fontSize: 14,
                fontWeight: 600,
                outline: 'none',
              }}
              placeholder="main"
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: '#1a1a1a', cursor: 'pointer' }}
              />
              <span style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 14 }}>Auto-deploy enabled</span>
            </label>
          </div>

          {/* Environment Variables */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Environment Variables
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {Object.entries(envVars).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={key}
                    readOnly
                    style={{
                      flex: 1, padding: '10px 12px', border: '2px solid #1a1a1a',
                      background: '#f5f5f5', color: '#1a1a1a', fontSize: 13, fontWeight: 700,
                      fontFamily: 'JetBrains Mono, monospace', outline: 'none',
                    }}
                  />
                  <input
                    value={value}
                    onChange={(e) => setEnvVars({ ...envVars, [key]: e.target.value })}
                    style={{
                      flex: 2, padding: '10px 12px', border: '2px solid #1a1a1a',
                      background: '#f5f5f5', color: '#1a1a1a', fontSize: 13, fontWeight: 600,
                      fontFamily: 'JetBrains Mono, monospace', outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => { const copy = { ...envVars }; delete copy[key]; setEnvVars(copy); }}
                    style={{
                      padding: '10px 12px', border: '2px solid #1a1a1a', background: '#ffffff',
                      color: '#1a1a1a', fontWeight: 800, cursor: 'pointer', fontSize: 14,
                    }}
                  >×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="KEY"
                style={{
                  flex: 1, padding: '10px 12px', border: '2px solid #1a1a1a',
                  background: '#ffffff', color: '#1a1a1a', fontSize: 12, fontWeight: 700,
                  fontFamily: 'JetBrains Mono, monospace', outline: 'none',
                }}
              />
              <input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="value"
                style={{
                  flex: 2, padding: '10px 12px', border: '2px solid #1a1a1a',
                  background: '#ffffff', color: '#1a1a1a', fontSize: 12, fontWeight: 600,
                  fontFamily: 'JetBrains Mono, monospace', outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  if (newKey.trim()) {
                    setEnvVars({ ...envVars, [newKey.trim()]: newValue });
                    setNewKey('');
                    setNewValue('');
                  }
                }}
                style={{
                  padding: '10px 14px', border: '2px solid #1a1a1a', background: '#1a1a1a',
                  color: '#ffffff', fontWeight: 800, cursor: 'pointer', fontSize: 12,
                  textTransform: 'uppercase',
                }}
              >Add</button>
            </div>
          </div>

          <button
            onClick={handleSave}
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
              boxShadow: saving ? '2px 2px 0 #1a1a1a' : '4px 4px 0 #1a1a1a',
              transition: 'all 0.1s ease',
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </motion.div>

        {/* Deployment History */}
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
            Deployment History
          </h2>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              Loading...
            </div>
          ) : deployments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
              No deployments yet
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {deployments.map((deployment) => (
                <Link
                  key={deployment.id}
                  to={`/deployments/${deployment.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 14,
                    border: '2px solid #1a1a1a',
                    marginBottom: 8,
                    textDecoration: 'none',
                    background: '#ffffff',
                    transition: 'all 0.1s ease',
                    boxShadow: '2px 2px 0 #1a1a1a',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#f5f5f5';
                    e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
                    e.currentTarget.style.transform = 'translate(1px, 1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
                    e.currentTarget.style.transform = 'translate(0, 0)';
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#1a1a1a', fontWeight: 700 }}>
                      {deployment.ref.substring(0, 8)}...
                    </div>
                    <div style={{ fontSize: 12, color: '#666', fontWeight: 600, marginTop: 4 }}>
                      {new Date(deployment.started_at).toLocaleString()}
                    </div>
                  </div>
                  <DeployBadge status={deployment.status} />
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {showDeployModal && (
        <DeployModal
          showDeployModal={showDeployModal}
          onClose={() => setShowDeployModal(null)}
          onDeploy={handleDeployConfirm}
          envVars={deployEnvVars}
          setEnvVars={setDeployEnvVars}
          envExample={envExample}
          loadingEnv={loadingEnv}
        />
      )}
    </div>
  );
}

function AddRepoModal({ onClose, onAdd }: { onClose: () => void; onAdd: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [config, setConfig] = useState({
    root_path: '/',
    deploy_mode: 'release' as 'release' | 'commit',
    watch_branch: 'main',
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.length >= 2) {
        searchRepos();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function searchRepos() {
    setLoading(true);
    try {
      const response = await api.get(`/api/repos/search?q=${encodeURIComponent(search)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.repos);
      }
    } catch (error) {
      console.error('Search failed:', error);
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
        ...config,
      });
      onAdd();
      onClose();
    } catch (error) {
      console.error('Add failed:', error);
    } finally {
      setAdding(false);
    }
  }

  // Common input style
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#666',
    fontSize: 11,
    marginBottom: 8,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          border: '4px solid #1a1a1a',
          padding: 32,
          width: 520,
          maxWidth: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '8px 8px 0 #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
            Add Repository
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '2px solid #1a1a1a',
              color: '#1a1a1a',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 16,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {!selected ? (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GitHub repositories..."
              autoFocus
              style={{ ...inputStyle, marginBottom: 20 }}
            />

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
                Searching...
              </div>
            ) : results.length === 0 && search.length >= 2 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
                No repositories found
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {results.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => setSelected(repo)}
                    style={{
                      padding: 14,
                      marginBottom: 8,
                      cursor: 'pointer',
                      border: '2px solid #1a1a1a',
                      background: '#ffffff',
                      boxShadow: '2px 2px 0 #1a1a1a',
                      transition: 'all 0.1s ease',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#1a1a1a';
                      (e.currentTarget.querySelector('span') as HTMLElement).style.color = '#ffffff';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      (e.currentTarget.querySelector('span') as HTMLElement).style.color = '#1a1a1a';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#1a1a1a', fontWeight: 700, transition: 'color 0.1s ease' }}>{repo.full_name}</span>
                      {repo.private && (
                        <span style={{
                          fontSize: 10,
                          padding: '3px 8px',
                          border: '2px solid #1a1a1a',
                          color: '#1a1a1a',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Private
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{
              padding: 16,
              border: '2px solid #1a1a1a',
              marginBottom: 24,
              background: '#f5f5f5',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#1a1a1a', fontWeight: 800, fontSize: 15 }}>{selected.full_name}</span>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: 'none',
                    border: '2px solid #1a1a1a',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '4px 10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Change
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Root Path</label>
              <input
                type="text"
                value={config.root_path}
                onChange={(e) => setConfig({ ...config, root_path: e.target.value })}
                style={inputStyle}
                placeholder="/"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Deploy Mode</label>
              <select
                value={config.deploy_mode}
                onChange={(e) => setConfig({ ...config, deploy_mode: e.target.value as 'release' | 'commit' })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="release">Release — deploy on new tags</option>
                <option value="commit">Commit — deploy on new commits</option>
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={labelStyle}>Watch Branch</label>
              <input
                type="text"
                value={config.watch_branch}
                onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })}
                style={inputStyle}
                placeholder="main"
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: '3px solid #1a1a1a',
                  background: '#ffffff',
                  color: '#1a1a1a',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 13,
                  boxShadow: '3px 3px 0 #1a1a1a',
                  transition: 'all 0.1s ease',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: '3px solid #1a1a1a',
                  background: adding ? '#f5f5f5' : '#1a1a1a',
                  color: adding ? '#666' : '#ffffff',
                  fontWeight: 800,
                  cursor: adding ? 'not-allowed' : 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 13,
                  boxShadow: adding ? '1px 1px 0 #1a1a1a' : '3px 3px 0 #1a1a1a',
                  transition: 'all 0.1s ease',
                }}
              >
                {adding ? 'Adding...' : 'Add Repository'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function DeployModal({ 
  showDeployModal, 
  onClose, 
  onDeploy, 
  envVars, 
  setEnvVars, 
  envExample, 
  loadingEnv 
}: { 
  showDeployModal: { repoId: number; repoName: string } | null;
  onClose: () => void;
  onDeploy: () => void;
  envVars: Record<string, string>;
  setEnvVars: (vars: Record<string, string>) => void;
  envExample: Record<string, string> | null;
  loadingEnv: boolean;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  if (!showDeployModal) return null;

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 12px',
    border: '2px solid #1a1a1a',
    background: '#ffffff',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'JetBrains Mono, monospace',
    outline: 'none',
  };

  const valueStyle: React.CSSProperties = {
    flex: 2,
    padding: '10px 12px',
    border: '2px solid #1a1a1a',
    background: '#ffffff',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'JetBrains Mono, monospace',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#666',
    fontSize: 11,
    marginBottom: 8,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          border: '4px solid #1a1a1a',
          padding: 32,
          width: 600,
          maxWidth: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '8px 8px 0 #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a', textTransform: 'uppercase' }}>
            Deploy {showDeployModal.repoName}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '2px solid #1a1a1a',
              color: '#1a1a1a',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: 20,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {loadingEnv ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#666', fontWeight: 600 }}>
            Loading environment variables...
          </div>
        ) : (
          <>
            {envExample && (
              <div style={{
                padding: 12,
                border: '2px dashed #1a1a1a',
                background: '#f0fff4',
                marginBottom: 20,
              }}>
                <p style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                  ✅ Loaded from .env.example
                </p>
                <p style={{ color: '#666', fontWeight: 600, fontSize: 11 }}>
                  Edit values below or add new variables
                </p>
              </div>
            )}
            {!envExample && Object.keys(envVars).length === 0 && (
              <div style={{
                padding: 12,
                border: '2px dashed #1a1a1a',
                background: '#f5f5f5',
                marginBottom: 20,
                textAlign: 'center',
              }}>
                <p style={{ color: '#666', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                  No .env.example found in repository
                </p>
                <p style={{ color: '#888', fontWeight: 600, fontSize: 11 }}>
                  Add custom environment variables below for this deployment
                </p>
              </div>
            )}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Environment Variables</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {Object.entries(envVars).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={key}
                      readOnly
                      style={{ ...inputStyle, background: '#f5f5f5' }}
                    />
                    <input
                      value={value}
                      onChange={(e) => setEnvVars({ ...envVars, [key]: e.target.value })}
                      style={valueStyle}
                    />
                    <button
                      onClick={() => {
                        const copy = { ...envVars };
                        delete copy[key];
                        setEnvVars(copy);
                      }}
                      style={{
                        padding: '10px 12px',
                        border: '2px solid #1a1a1a',
                        background: '#ffffff',
                        color: '#1a1a1a',
                        fontWeight: 800,
                        cursor: 'pointer',
                        fontSize: 14,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="KEY"
                  style={inputStyle}
                />
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="value"
                  style={valueStyle}
                />
                <button
                  onClick={() => {
                    if (newKey.trim()) {
                      setEnvVars({ ...envVars, [newKey.trim()]: newValue });
                      setNewKey('');
                      setNewValue('');
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    border: '2px solid #1a1a1a',
                    background: '#1a1a1a',
                    color: '#ffffff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: 12,
                    textTransform: 'uppercase',
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onClose}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: '3px solid #1a1a1a',
                  background: '#ffffff',
                  color: '#1a1a1a',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 13,
                  boxShadow: '3px 3px 0 #1a1a1a',
                }}
              >
                Cancel
              </button>
              <button
                onClick={onDeploy}
                style={{
                  flex: 1,
                  padding: '14px',
                  border: '3px solid #1a1a1a',
                  background: '#1a1a1a',
                  color: '#ffffff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: 13,
                  boxShadow: '3px 3px 0 #1a1a1a',
                }}
              >
                Deploy
              </button>
            </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
