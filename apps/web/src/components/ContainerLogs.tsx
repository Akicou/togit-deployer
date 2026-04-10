import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Loader2, Play, Square } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface ContainerLogsProps {
  repoId: number;
  canExec: boolean;
}

export default function ContainerLogs({ repoId, canExec }: ContainerLogsProps) {
  const [logs, setLogs] = useState<string>('');
  const [following, setFollowing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'terminal'>('logs');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<ReadableStreamDefaultReader | null>(null);

  // Fetch initial logs
  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const response = await fetch(`/api/repos/${repoId}/container/logs?tail=100`);
        if (!response.ok) throw new Error('Failed to fetch logs');
        const text = await response.text();
        if (!cancelled) {
          setLogs(text);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLogs();
    return () => { cancelled = true; };
  }, [repoId]);

  // Follow logs
  useEffect(() => {
    if (following && activeTab === 'logs') {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, following, activeTab]);

  // Start following stream
  useEffect(() => {
    if (!following || activeTab !== 'logs') return;

    let cancelled = false;

    async function followLogs() {
      try {
        const response = await fetch(`/api/repos/${repoId}/container/logs?tail=0&follow=true`);
        if (!response.ok || !response.body) throw new Error('Failed to follow logs');

        const reader = response.body.getReader();
        streamRef.current = reader;
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!cancelled) {
            setLogs(prev => prev + decoder.decode(value, { stream: true }));
          }
        }
      } catch (err) {
        if (!cancelled && err instanceof Error) {
          console.error('Log stream error:', err);
        }
      }
    }

    followLogs();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.cancel().catch(() => {});
      }
    };
  }, [following, repoId, activeTab]);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <TerminalIcon className="w-4 h-4" />
          Container
        </CardTitle>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'logs' | 'terminal')}>
          <TabsList className="h-7">
            <TabsTrigger value="logs" className="text-xs">Logs</TabsTrigger>
            {canExec && <TabsTrigger value="terminal" className="text-xs">Terminal</TabsTrigger>}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'logs' | 'terminal')}>
          <TabsContent value="logs" className="m-0">
            <div className="flex items-center justify-between p-2 border-b bg-muted/30">
              <p className="text-xs text-muted-foreground">Live container logs</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFollowing(!following)}
              >
                {following ? <><Square className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Follow</>}
              </Button>
            </div>
            <div className="h-[400px] bg-zinc-950 p-3 font-mono text-xs overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading logs...
                </div>
              ) : error ? (
                <div className="text-red-400">{error}</div>
              ) : (
                <pre className="whitespace-pre-wrap text-zinc-300">{logs || <span className="text-zinc-600">No logs yet...</span>}</pre>
              )}
              <div ref={logsEndRef} />
            </div>
          </TabsContent>
          {canExec && (
            <TabsContent value="terminal" className="m-0">
              <Terminal repoId={repoId} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Terminal({ repoId }: { repoId: number }) {
  const [output, setOutput] = useState<string>('');
  const [input, setInput] = useState<string>('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/exec/${repoId}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      setOutput('Connected to container terminal.\nType commands and press Enter.\n$ ');
    };

    ws.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
      setOutput(prev => prev + data);
    };

    ws.onclose = () => {
      setConnected(false);
      setOutput(prev => prev + '\nDisconnected.');
    };

    ws.onerror = () => {
      setError('Failed to connect to terminal');
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [repoId]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setOutput(prev => prev + '\n' + input + '\n');
    wsRef.current.send(input);
    setInput('');
  }

  return (
    <>
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          {connected ? 'Connected' : 'Disconnected'}
        </p>
      </div>
      <div className="h-[400px] bg-zinc-950 p-3 font-mono text-xs overflow-y-auto">
        {error ? (
          <div className="text-red-400">{error}</div>
        ) : (
          <pre className="whitespace-pre-wrap text-zinc-300">{output}</pre>
        )}
        <div ref={outputEndRef} />
      </div>
      {connected && (
        <form onSubmit={handleSubmit} className="p-2 border-t bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-mono text-xs">$</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter command..."
              className="flex-1 bg-transparent border-none outline-none font-mono text-xs text-foreground"
              autoFocus
            />
          </div>
        </form>
      )}
    </>
  );
}
