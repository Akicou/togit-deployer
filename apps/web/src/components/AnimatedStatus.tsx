import { motion } from 'framer-motion';

interface AnimatedStatusProps {
  status: 'running' | 'building' | 'pending' | 'failed' | 'success';
  size?: number;
}

export default function AnimatedStatus({ status, size = 24 }: AnimatedStatusProps) {
  const config = {
    running: {
      color: '#3fb950',
      bg: 'rgba(63, 185, 80, 0.15)',
      animate: { scale: [1, 1.1, 1] },
      transition: { repeat: Infinity, duration: 2 },
    },
    building: {
      color: '#d29922',
      bg: 'rgba(210, 153, 34, 0.15)',
      animate: { rotate: 360 },
      transition: { repeat: Infinity, duration: 1, ease: 'linear' },
    },
    pending: {
      color: '#8b949e',
      bg: 'rgba(139, 148, 158, 0.15)',
      animate: { opacity: [1, 0.5, 1] },
      transition: { repeat: Infinity, duration: 1.5 },
    },
    failed: {
      color: '#f85149',
      bg: 'rgba(248, 81, 73, 0.15)',
      animate: { x: [-2, 2, -2, 2, 0] },
      transition: { duration: 0.4 },
    },
    success: {
      color: '#3fb950',
      bg: 'rgba(63, 185, 80, 0.15)',
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
        borderRadius: '50%',
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
          borderRadius: '50%',
          background: color,
        }}
      />
    </motion.div>
  );
}
