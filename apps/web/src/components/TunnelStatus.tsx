import { motion } from 'framer-motion';

interface TunnelStatusProps {
  status: 'connected' | 'disconnected' | 'pending';
  url?: string;
}

export default function TunnelStatus({ status, url }: TunnelStatusProps) {
  const config = {
    connected: { color: '#3fb950', label: 'Online', icon: CheckIcon },
    disconnected: { color: '#f85149', label: 'Offline', icon: XIcon },
    pending: { color: '#d29922', label: 'Connecting...', icon: SpinnerIcon },
  };

  const { color, label, icon: Icon } = config[status];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: 'rgba(0, 0, 0, 0.2)',
      borderRadius: 8,
    }}>
      <Icon color={color} />
      <span style={{ color, fontWeight: 500, fontSize: 13 }}>{label}</span>
      {url && status === 'connected' && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#22d3ee',
            fontSize: 12,
            marginLeft: 4,
            textDecoration: 'none',
          }}
        >
          {url}
        </a>
      )}
    </div>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <motion.svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
    >
      <motion.circle cx="12" cy="12" r="10" />
      <motion.path d="M8 12l2 2 4-4" />
    </motion.svg>
  );
}

function XIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function SpinnerIcon({ color }: { color: string }) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      style={{
        display: 'inline-block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
      }}
    />
  );
}
