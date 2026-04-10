import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { cn } from '../lib/utils';

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
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 48, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 48, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium pointer-events-auto max-w-sm',
                t.type === 'success' && 'bg-card border-green-200 text-green-800',
                t.type === 'error'   && 'bg-destructive border-destructive text-destructive-foreground',
                t.type === 'info'    && 'bg-card border-border text-foreground'
              )}
            >
              {t.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />}
              {t.type === 'error'   && <XCircle className="w-4 h-4 shrink-0" />}
              {t.type === 'info'    && <Info className="w-4 h-4 text-muted-foreground shrink-0" />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
