import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}>
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 48 }}
              transition={{ duration: 0.15 }}
              style={{
                padding: '12px 18px',
                border: '3px solid #1a1a1a',
                background: t.type === 'error' ? '#1a1a1a' : '#ffffff',
                color: t.type === 'error' ? '#ffffff' : '#1a1a1a',
                fontWeight: 700,
                fontSize: 13,
                maxWidth: 340,
                boxShadow: '4px 4px 0 #1a1a1a',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                pointerEvents: 'auto',
              }}
            >
              {t.type === 'success' && (
                <span style={{ fontWeight: 800, color: '#1a1a1a' }}>✓</span>
              )}
              {t.type === 'error' && (
                <span style={{ fontWeight: 800, color: '#ffffff' }}>✕</span>
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
