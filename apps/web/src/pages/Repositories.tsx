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
  const [_deploying, setDeploying] = useState<number | null>(null);

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

  async function handleDeploy(repoId: number) {
    setDeploying(repoId);
    try {
      const response = await api.post(`/api/repos/${repoId}/deploy`);
      if (response.ok) {
        await loadRepos();
      }
    } catch (error) {
      console.error('Deploy failed:', error);
    } finally {
      setDeploying(null);
    }
  }

  // If we have an ID, show the detail view
  if (id) {
    const repo = repos.find((r) => r.id === parseInt(id, 10));
    return repo ? (
      <RepoDetail repo={repo} user={user} onRefresh={loadRepos} />
    ) : (
      <div style={{ color: '#8b949e' }}>Loading...</div>
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
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
            Repositories
          </h1>
          <p style={{ color: '#8b949e' }}>
            {repos.length} repository{repos.length !== 1 ? 'ies' : ''} configured
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Repository
          </button>
        )}
      </motion.div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
          Loading repositories...
        </div>
      ) : repos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            textAlign: 'center',
            padding: 60,
            background: '#161b22',
            borderRadius: 12,
            border: '1px dashed #30363d',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5" style={{ margin: '0 auto' }}>
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>
          <h3 style={{ color: '#f0f6fc', marginBottom: 8 }}>No repositories yet</h3>
          <p style={{ color: '#8b949e', marginBottom: 24 }}>
            Add a GitHub repository to start deploying
          </p>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#6366f1',
                color: 'white',
                fontWeight: 600,
                cursor: 'pointer',
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
          gap: 16,
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
                onDeploy={handleDeploy}
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
      </AnimatePresence>
    </div>
  );
}

function RepoDetail({ repo, user, onRefresh }: { repo: Repository; user: User; onRefresh: () => void }) {
  const { deployments, loading } = useDeployments(repo.id);
  const [config, setConfig] = useState({
    root_path: repo.root_path,
    deploy_mode: repo.deploy_mode,
    watch_branch: repo.watch_branch ?? 'main',
    enabled: repo.enabled,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/repos/${repo.id}`, config);
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
            color: '#8b949e',
            textDecoration: 'none',
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 16,
          }}
        >
          ← Back to Repositories
        </Link>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 32,
        }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
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
                    padding: '4px 10px',
                    borderRadius: 16,
                    background: 'rgba(34, 211, 238, 0.15)',
                    color: '#22d3ee',
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  if (!isDeploying) await api.post(`/api/repos/${repo.id}/deploy`);
                }}
                disabled={isDeploying}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: isDeploying ? '#484f58' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: isDeploying ? 'not-allowed' : 'pointer',
                  opacity: isDeploying ? 0.7 : 1,
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
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f0f6fc', marginBottom: 20 }}>
            Configuration
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
              Root Path
            </label>
            <input
              type="text"
              value={config.root_path}
              onChange={(e) => setConfig({ ...config, root_path: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 14,
              }}
              placeholder="/"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
              Deploy Mode
            </label>
            <select
              value={config.deploy_mode}
              onChange={(e) => setConfig({ ...config, deploy_mode: e.target.value as 'release' | 'commit' })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 14,
              }}
            >
              <option value="release">Release (deploy on new tags)</option>
              <option value="commit">Commit (deploy on new commits)</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
              Watch Branch
            </label>
            <input
              type="text"
              value={config.watch_branch}
              onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 14,
              }}
              placeholder="main"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: '#6366f1' }}
              />
              <span style={{ color: '#f0f6fc' }}>Auto-deploy enabled</span>
            </label>
          </div>

          <button
            onClick={handleSave}
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
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </motion.div>

        {/* Deployment History */}
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
            Deployment History
          </h2>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
              Loading...
            </div>
          ) : deployments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
              No deployments yet
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {deployments.map((deployment) => (
                <Link
                  key={deployment.id}
                  to={`/deployments/${deployment.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    background: '#0d1117',
                    borderRadius: 8,
                    marginBottom: 8,
                    textDecoration: 'none',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#f0f6fc' }}>
                      {deployment.ref.substring(0, 8)}...
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e' }}>
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
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
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 16,
          padding: 24,
          width: 500,
          maxWidth: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#f0f6fc', marginBottom: 20 }}>
          Add Repository
        </h2>

        {!selected ? (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GitHub repositories..."
              autoFocus
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 14,
                marginBottom: 16,
              }}
            />

            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                Searching...
              </div>
            ) : results.length === 0 && search.length >= 2 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8b949e' }}>
                No repositories found
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {results.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => setSelected(repo)}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      background: '#0d1117',
                      marginBottom: 8,
                      cursor: 'pointer',
                      border: '1px solid transparent',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#6366f1';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#f0f6fc', fontWeight: 500 }}>{repo.full_name}</span>
                      {repo.private && (
                        <span style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(248, 81, 73, 0.15)',
                          color: '#f85149',
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
              background: '#0d1117',
              borderRadius: 8,
              marginBottom: 20,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{selected.full_name}</span>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8b949e',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Change
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
                Root Path
              </label>
              <input
                type="text"
                value={config.root_path}
                onChange={(e) => setConfig({ ...config, root_path: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: '#0d1117',
                  color: '#f0f6fc',
                  fontSize: 14,
                }}
                placeholder="/"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
                Deploy Mode
              </label>
              <select
                value={config.deploy_mode}
                onChange={(e) => setConfig({ ...config, deploy_mode: e.target.value as 'release' | 'commit' })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: '#0d1117',
                  color: '#f0f6fc',
                  fontSize: 14,
                }}
              >
                <option value="release">Release (deploy on new tags)</option>
                <option value="commit">Commit (deploy on new commits)</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#8b949e', fontSize: 13, marginBottom: 6 }}>
                Watch Branch
              </label>
              <input
                type="text"
                value={config.watch_branch}
                onChange={(e) => setConfig({ ...config, watch_branch: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: '#0d1117',
                  color: '#f0f6fc',
                  fontSize: 14,
                }}
                placeholder="main"
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  background: 'transparent',
                  color: '#c9d1d9',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 6,
                  border: 'none',
                  background: adding ? '#484f58' : '#6366f1',
                  color: 'white',
                  fontWeight: 600,
                  cursor: adding ? 'not-allowed' : 'pointer',
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
