import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import LogViewer from '../components/LogViewer';
import type { Log } from '../types';

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    level: '',
    limit: 100,
    offset: 0,
  });

  const { logs: liveLogs, connected } = useWebSocket('all');

  useEffect(() => {
    loadLogs();
  }, [filters]);

  useEffect(() => {
    if (liveLogs.length > 0) {
      setLogs((prev) => [...prev.slice(-999), ...liveLogs.slice(prev.length > 0 ? 0 : -liveLogs.length)]);
    }
  }, [liveLogs]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.level) params.set('level', filters.level);
      params.set('limit', filters.limit.toString());
      params.set('offset', filters.offset.toString());

      const response = await api.get(`/api/logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleJumpToBottom() {
    // The LogViewer handles this internally via auto-scroll
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 24 }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f6fc', marginBottom: 8 }}>
          Logs
        </h1>
        <p style={{ color: '#8b949e' }}>
          Real-time system logs and build output
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                minWidth: 120,
              }}
            >
              <option value="">All</option>
              <option value="build">Build</option>
              <option value="network">Network</option>
              <option value="docker">Docker</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>
              Level
            </label>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                minWidth: 100,
              }}
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: '#8b949e', fontSize: 12, marginBottom: 4 }}>
              Show
            </label>
            <select
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value, 10) })}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
              }}
            >
              <option value="50">50 lines</option>
              <option value="100">100 lines</option>
              <option value="200">200 lines</option>
              <option value="500">500 lines</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <button
              onClick={loadLogs}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #30363d',
                background: 'transparent',
                color: '#c9d1d9',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>

            <div style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: connected ? 'rgba(63, 185, 80, 0.15)' : 'rgba(139, 148, 158, 0.15)',
              color: connected ? '#3fb950' : '#8b949e',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connected ? '#3fb950' : '#8b949e',
              }} />
              {connected ? 'Live' : 'Offline'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Log Viewer */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: 16,
          height: 'calc(100vh - 280px)',
          minHeight: 400,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#8b949e' }}>
            Loading logs...
          </div>
        ) : (
          <LogViewer
            logs={logs}
            onJumpToBottom={handleJumpToBottom}
            showJumpButton={true}
          />
        )}
      </motion.div>
    </div>
  );
}
