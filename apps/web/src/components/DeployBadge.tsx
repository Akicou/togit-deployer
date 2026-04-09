import { motion } from 'framer-motion';

interface DeployBadgeProps {
  status: string;
}

const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)', label: 'Pending' },
  building: { color: '#d29922', bg: 'rgba(210, 153, 34, 0.15)', label: 'Building' },
  running: { color: '#3fb950', bg: 'rgba(63, 185, 80, 0.15)', label: 'Running' },
  failed: { color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', label: 'Failed' },
  rolled_back: { color: '#a371f7', bg: 'rgba(163, 113, 247, 0.15)', label: 'Rolled Back' },
  never: { color: '#6e7681', bg: 'rgba(110, 118, 129, 0.15)', label: 'Never' },
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
        padding: '4px 10px',
        borderRadius: 16,
        background: config.bg,
        color: config.color,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {isAnimating && (
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
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
            borderRadius: '50%',
            background: config.color,
          }}
        />
      )}
      {config.label}
    </motion.span>
  );
}
