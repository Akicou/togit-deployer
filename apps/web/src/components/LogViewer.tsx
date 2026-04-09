import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Log } from '../types';

interface LogViewerProps {
  logs: Log[];
  onJumpToBottom?: () => void;
  showJumpButton?: boolean;
}

const levelColors: Record<string, { color: string; bg: string }> = {
  info: { color: '#c9d1d9', bg: 'transparent' },
  warn: { color: '#d29922', bg: 'rgba(210, 153, 34, 0.1)' },
  error: { color: '#f85149', bg: 'rgba(248, 81, 73, 0.1)' },
};

const categoryColors: Record<string, string> = {
  build: '#6366f1',
  network: '#22d3ee',
  docker: '#3fb950',
  system: '#a371f7',
};

export default function LogViewer({ logs, onJumpToBottom, showJumpButton = true }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: '100%',
          overflowY: 'auto',
          background: '#0d1117',
          borderRadius: 8,
          padding: 16,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#484f58', textAlign: 'center', padding: 40 }}>
            No logs yet. Waiting for activity...
          </div>
        ) : (
          logs.map((log, index) => (
            <motion.div
              key={log.id || `${log.created_at}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                padding: '2px 8px',
                marginBottom: 2,
                borderRadius: 4,
                background: levelColors[log.level]?.bg || 'transparent',
                color: levelColors[log.level]?.color || '#c9d1d9',
              }}
            >
              <span style={{ color: '#6e7681', marginRight: 8 }}>
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span
                style={{
                  color: categoryColors[log.category] || '#8b949e',
                  marginRight: 8,
                  fontWeight: 500,
                }}
              >
                [{log.category.toUpperCase()}]
              </span>
              <span style={{ color: log.level === 'error' ? '#f85149' : 'inherit' }}>
                {log.message}
              </span>
            </motion.div>
          ))
        )}
      </div>

      {showJumpButton && !autoScroll && onJumpToBottom && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            setAutoScroll(true);
            onJumpToBottom();
          }}
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            padding: '8px 16px',
            borderRadius: 20,
            border: 'none',
            background: '#6366f1',
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          Jump to bottom
        </motion.button>
      )}
    </div>
  );
}
