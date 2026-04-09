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
    minWidth: 120,
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 36 }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#1a1a1a', marginBottom: 8, letterSpacing: '-1px' }}>
          LOGS
        </h1>
        <p style={{ color: '#666', fontWeight: 600, fontSize: 14 }}>
          Real-time system logs and build output
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          background: '#ffffff',
          border: '3px solid #1a1a1a',
          padding: 20,
          marginBottom: 20,
          boxShadow: '4px 4px 0 #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              style={selectStyle}
            >
              <option value="">All Categories</option>
              <option value="build">Build</option>
              <option value="network">Network</option>
              <option value="docker">Docker</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Level
            </label>
            <select
              value={filters.level}
              onChange={(e) => setFilters({ ...filters, level: e.target.value })}
              style={selectStyle}
            >
              <option value="">All Levels</option>
              <option value="info">Info</option>
              <option value="warn">Warning</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', color: '#666', fontSize: 11, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Show
            </label>
            <select
              value={filters.limit}
              onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value, 10) })}
              style={selectStyle}
            >
              <option value="50">50 lines</option>
              <option value="100">100 lines</option>
              <option value="200">200 lines</option>
              <option value="500">500 lines</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={loadLogs}
              style={{
                padding: '10px 20px',
                border: '2px solid #1a1a1a',
                background: '#ffffff',
                color: '#1a1a1a',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: '3px 3px 0 #1a1a1a',
                transition: 'all 0.1s ease',
                fontFamily: 'inherit',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#1a1a1a';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.boxShadow = '1px 1px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(2px, 2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.color = '#1a1a1a';
                e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
                e.currentTarget.style.transform = 'translate(0, 0)';
              }}
            >
              Refresh
            </button>

            <div style={{
              padding: '10px 14px',
              border: '2px solid #1a1a1a',
              background: connected ? '#1a1a1a' : '#f5f5f5',
              color: connected ? '#ffffff' : '#888',
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: connected ? '#4ade80' : '#ccc',
                boxShadow: connected ? '0 0 8px #4ade80' : 'none',
              }} />
              {connected ? 'LIVE UPDATES' : 'HISTORICAL LOGS'}
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
          border: '3px solid #1a1a1a',
          boxShadow: '4px 4px 0 #1a1a1a',
          height: 'calc(100vh - 320px)',
          minHeight: 400,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#666', fontWeight: 600, background: '#f5f5f5', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
