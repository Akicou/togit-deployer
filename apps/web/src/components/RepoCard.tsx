import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { Repository } from '../types';
import DeployBadge from './DeployBadge';

interface RepoCardProps {
  repo: Repository;
  onDeploy?: (id: number, name: string) => void;
  canDeploy?: boolean;
}

export default function RepoCard({ repo, onDeploy, canDeploy = false }: RepoCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '6px 6px 0 #1a1a1a' }}
      style={{
        background: '#ffffff',
        border: '3px solid #1a1a1a',
        padding: 24,
        boxShadow: '4px 4px 0 #1a1a1a',
        transition: 'all 0.1s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <Link
            to={`/repositories/${repo.id}`}
            style={{
              color: '#1a1a1a',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: '-0.3px',
            }}
          >
            {repo.full_name}
          </Link>
          <div style={{ color: '#666', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
            service: {repo.service_name}{repo.project_name ? ` · project: ${repo.project_name}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11,
              padding: '4px 10px',
              border: '2px solid #1a1a1a',
              background: repo.deploy_mode === 'release' ? '#1a1a1a' : '#ffffff',
              color: repo.deploy_mode === 'release' ? '#ffffff' : '#1a1a1a',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {repo.deploy_mode}
            </span>
            {repo.private && (
              <span style={{
                fontSize: 11,
                padding: '4px 10px',
                border: '2px solid #1a1a1a',
                background: '#ffffff',
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
        <DeployBadge status={repo.last_deployment_status || 'never'} />
      </div>

      {repo.last_deployed_ref && (
        <div style={{
          fontSize: 13,
          color: '#666',
          marginBottom: 12,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{ color: '#1a1a1a', fontWeight: 700 }}>LAST:</span> {repo.last_deployed_ref.substring(0, 12)}...
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
            color: '#1a1a1a',
            textDecoration: 'underline',
            marginBottom: 16,
            fontWeight: 700,
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

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <Link
          to={`/repositories/${repo.id}`}
          style={{
            flex: 1,
            padding: '12px 16px',
            border: '2px solid #1a1a1a',
            background: '#ffffff',
            color: '#1a1a1a',
            textDecoration: 'none',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            boxShadow: '3px 3px 0 #1a1a1a',
            transition: 'all 0.1s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
            e.currentTarget.style.transform = 'translate(2px, 2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
            e.currentTarget.style.transform = 'translate(0, 0)';
          }}
        >
          View
        </Link>
        {canDeploy && onDeploy && (
          <button
            onClick={() => onDeploy(repo.id, repo.full_name)}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '2px solid #1a1a1a',
              background: '#1a1a1a',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '3px 3px 0 #1a1a1a',
              transition: 'all 0.1s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(2px, 2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(0, 0)';
            }}
          >
            Deploy
          </button>
        )}
      </div>
    </motion.div>
  );
}
