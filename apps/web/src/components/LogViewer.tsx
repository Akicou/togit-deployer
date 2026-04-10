import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { ArrowDown } from 'lucide-react';
import type { Log } from '../types';

interface LogViewerProps {
  logs: Log[];
  onJumpToBottom?: () => void;
  showJumpButton?: boolean;
}

const levelClass: Record<string, string> = {
  info:  'text-foreground',
  warn:  'text-yellow-600',
  error: 'text-red-500 font-semibold',
};

const categoryClass: Record<string, string> = {
  build:   'text-blue-500',
  network: 'text-purple-500',
  docker:  'text-cyan-500',
  system:  'text-muted-foreground',
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
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto bg-zinc-950 rounded-md p-4 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-10">No logs yet. Waiting for activity...</p>
        ) : (
          logs.map((log, index) => (
            <div key={log.id || `${log.created_at}-${index}`} className="flex gap-2 py-0.5">
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span className={cn('shrink-0 uppercase font-semibold', categoryClass[log.category] || 'text-muted-foreground')}>
                [{log.category}]
              </span>
              <span className={levelClass[log.level] || 'text-foreground'}>{log.message}</span>
            </div>
          ))
        )}
      </div>

      {showJumpButton && !autoScroll && onJumpToBottom && (
        <Button
          size="sm"
          className="absolute bottom-4 right-4"
          onClick={() => { setAutoScroll(true); onJumpToBottom(); }}
        >
          <ArrowDown className="w-4 h-4" />
          Jump to bottom
        </Button>
      )}
    </div>
  );
}
