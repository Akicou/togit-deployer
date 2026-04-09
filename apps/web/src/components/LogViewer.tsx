import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Log } from '../types';

interface LogViewerProps {
  logs: Log[];
  onJumpToBottom?: () => void;
  showJumpButton?: boolean;
}

const levelColors: Record<string, { color: string; bg: string }> = {
  info: { color: '#1a1a1a', bg: 'transparent' },
  warn: { color: '#1a1a1a', bg: '#f5f5f5' },
  error: { color: '#1a1a1a', bg: '#f5f5f5' },
};

const categoryColors: Record<string, string> = {
  build: '#1a1a1a',
  network: '#1a1a1a',
  docker: '#1a1a1a',
  system: '#1a1a1a',
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
          background: '#f5f5f5',
          border: '2px solid #1a1a1a',
          padding: 16,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 40, fontWeight: 600 }}>
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
                padding: '4px 8px',
                marginBottom: 2,
                background: levelColors[log.level]?.bg || 'transparent',
                color: levelColors[log.level]?.color || '#1a1a1a',
                fontWeight: log.level === 'error' ? 700 : 500,
              }}
            >
              <span style={{ color: '#666', marginRight: 8, fontWeight: 600 }}>
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span
                style={{
                  color: categoryColors[log.category] || '#1a1a1a',
                  marginRight: 8,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  fontSize: 11,
                  letterSpacing: '0.5px',
                }}
              >
                [{log.category.toUpperCase()}]
              </span>
              <span style={{ color: log.level === 'error' ? '#1a1a1a' : 'inherit' }}>
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
            padding: '10px 18px',
            border: '2px solid #1a1a1a',
            background: '#1a1a1a',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '3px 3px 0 #1a1a1a',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          Jump to bottom
        </motion.button>
      )}
    </div>
  );
}
