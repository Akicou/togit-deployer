import { motion } from 'framer-motion';

interface TunnelStatusProps {
  status: 'connected' | 'disconnected' | 'pending';
  url?: string;
}

export default function TunnelStatus({ status, url }: TunnelStatusProps) {
  const config = {
    connected: { color: '#1a1a1a', label: 'ONLINE', icon: CheckIcon },
    disconnected: { color: '#1a1a1a', label: 'OFFLINE', icon: XIcon },
    pending: { color: '#1a1a1a', label: 'PENDING', icon: SpinnerIcon },
  };

  const { label, icon: Icon } = config[status];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      border: '2px solid #1a1a1a',
      background: status === 'connected' ? '#1a1a1a' : '#ffffff',
      color: status === 'connected' ? '#ffffff' : '#1a1a1a',
    }}>
      <Icon color={status === 'connected' ? '#ffffff' : '#1a1a1a'} />
      <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      {url && status === 'connected' && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#ffffff',
            fontSize: 12,
            marginLeft: 4,
            textDecoration: 'underline',
            fontWeight: 700,
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
      strokeWidth="2.5"
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
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
        border: `2px solid ${color}`,
        borderTopColor: 'transparent',
      }}
    />
  );
}
