import { useState, useEffect, useCallback, useRef } from 'react';
import { createWebSocket } from '../lib/api';
import type { Log } from '../types';

export function useWebSocket(deploymentId?: number | 'all') {
  const [logs, setLogs] = useState<Log[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = createWebSocket(deploymentId);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      setConnected(false);
      // Attempt reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data) as Log;
        setLogs((prev) => [...prev.slice(-999), log]); // Keep last 1000 logs
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };
  }, [deploymentId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, connected, error, clearLogs, reconnect: connect };
}
