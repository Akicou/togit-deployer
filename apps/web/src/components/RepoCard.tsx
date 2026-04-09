import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Repository } from '../types';
import DeployBadge from './DeployBadge';

interface RepoCardProps {
  repo: Repository;
  onDeploy?: (id: number) => void;
  canDeploy?: boolean;
}

export default function RepoCard({ repo, onDeploy, canDeploy = false }: RepoCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(99, 102, 241, 0.15)' }}
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: 20,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <Link
            to={`/repositories/${repo.id}`}
            style={{
              color: '#f0f6fc',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            {repo.full_name}
          </Link>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 12,
              background: repo.deploy_mode === 'release' ? 'rgba(34, 211, 238, 0.15)' : 'rgba(99, 102, 241, 0.15)',
              color: repo.deploy_mode === 'release' ? '#22d3ee' : '#6366f1',
            }}>
              {repo.deploy_mode}
            </span>
            {repo.private && (
              <span style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 12,
                background: 'rgba(248, 81, 73, 0.15)',
                color: '#f85149',
              }}>
                private
              </span>
            )}
          </div>
        </div>
        <DeployBadge status={repo.last_deployment_status || 'never'} />
      </div>

      {repo.last_deployed_ref && (
        <div style={{
          fontSize: 13,
          color: '#8b949e',
          marginBottom: 8,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ color: '#6e7681' }}>Last:</span> {repo.last_deployed_ref.substring(0, 12)}...
        </div>
      )}

      {repo.last_tunnel_url && (
        <a
          href={repo.last_tunnel_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: '#22d3ee',
            textDecoration: 'none',
            marginBottom: 12,
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

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Link
          to={`/repositories/${repo.id}`}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #30363d',
            background: 'transparent',
            color: '#c9d1d9',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          View
        </Link>
        {canDeploy && onDeploy && (
          <button
            onClick={() => onDeploy(repo.id)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Deploy Now
          </button>
        )}
      </div>
    </motion.div>
  );
}
