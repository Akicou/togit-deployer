import { motion } from 'framer-motion';

interface AnimatedStatusProps {
  status: 'running' | 'building' | 'pending' | 'failed' | 'success';
  size?: number;
}

export default function AnimatedStatus({ status, size = 24 }: AnimatedStatusProps) {
  const config = {
    running: {
      color: '#1a1a1a',
      bg: '#1a1a1a',
      animate: { scale: [1, 1.1, 1] },
      transition: { repeat: Infinity, duration: 2 },
    },
    building: {
      color: '#1a1a1a',
      bg: '#ffffff',
      animate: { rotate: 360 },
      transition: { repeat: Infinity, duration: 1, ease: 'linear' },
    },
    pending: {
      color: '#666',
      bg: '#f5f5f5',
      animate: { opacity: [1, 0.5, 1] },
      transition: { repeat: Infinity, duration: 1.5 },
    },
    failed: {
      color: '#1a1a1a',
      bg: '#1a1a1a',
      animate: { x: [-2, 2, -2, 2, 0] },
      transition: { duration: 0.4 },
    },
    success: {
      color: '#1a1a1a',
      bg: '#1a1a1a',
      animate: { scale: [0, 1.2, 1] },
      transition: { duration: 0.3 },
    },
  };

  const { color, bg, animate, transition } = config[status];

  return (
    <motion.div
      animate={animate}
      transition={transition}
      style={{
        width: size,
        height: size,
        border: '2px solid #1a1a1a',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: size * 0.4,
          height: size * 0.4,
          background: color,
        }}
      />
    </motion.div>
  );
}
