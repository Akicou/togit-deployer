import { motion } from 'framer-motion';

interface DeployBadgeProps {
  status: string;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#1a1a1a', bg: '#ffffff', label: 'PENDING' },
  building: { color: '#1a1a1a', bg: '#ffffff', label: 'BUILDING' },
  running: { color: '#ffffff', bg: '#1a1a1a', label: 'RUNNING' },
  failed: { color: '#ffffff', bg: '#1a1a1a', label: 'FAILED' },
  rolled_back: { color: '#ffffff', bg: '#1a1a1a', label: 'ROLLED BACK' },
  never: { color: '#666', bg: '#f5f5f5', label: 'NEVER' },
};

export default function DeployBadge({ status }: DeployBadgeProps) {
  const config = statusConfig[status] || statusConfig.never;
  const isAnimating = status === 'building' || status === 'pending';

  return (
    <motion.span
      animate={isAnimating ? { scale: [1, 1.02, 1] } : {}}
      transition={{ repeat: Infinity, duration: 1.5 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        border: '2px solid #1a1a1a',
        background: config.bg,
        color: config.color,
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        boxShadow: isAnimating ? '2px 2px 0 #1a1a1a' : '1px 1px 0 #1a1a1a',
      }}
    >
      {isAnimating && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{
            width: 8,
            height: 8,
            border: `2px solid ${config.color}`,
            borderTopColor: 'transparent',
          }}
        />
      )}
      {status === 'running' && (
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
          style={{
            width: 6,
            height: 6,
            background: config.color,
          }}
        />
      )}
      {config.label}
    </motion.span>
  );
}
