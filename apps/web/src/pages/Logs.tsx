import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import LogViewer from '../components/LogViewer';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { RefreshCw, Radio } from 'lucide-react';
import type { Log } from '../types';

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category: '', level: '', limit: 100, offset: 0 });

  const { logs: liveLogs, connected } = useWebSocket('all');

  useEffect(() => { loadLogs(); }, [filters]);

  useEffect(() => {
    if (liveLogs.length > 0) {
      setLogs((prev) => [...prev.slice(-999), ...liveLogs.slice(prev.length > 0 ? 0 : -liveLogs.length)]);
    }
  }, [liveLogs]);

  async function loadLogs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.level) params.set('level', filters.level);
      params.set('limit', filters.limit.toString());
      params.set('offset', filters.offset.toString());
      const r = await api.get(`/api/logs?${params}`);
      if (r.ok) { const d = await r.json(); setLogs(d.logs); }
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time system logs and build output</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Category</Label>
              <Select value={filters.category || '__all__'} onValueChange={(v) => setFilters({ ...filters, category: v === '__all__' ? '' : v })}>
                <SelectTrigger className="w-full sm:w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Categories</SelectItem>
                  <SelectItem value="build">Build</SelectItem>
                  <SelectItem value="network">Network</SelectItem>
                  <SelectItem value="docker">Docker</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Level</Label>
              <Select value={filters.level || '__all__'} onValueChange={(v) => setFilters({ ...filters, level: v === '__all__' ? '' : v })}>
                <SelectTrigger className="w-full sm:w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Show</Label>
              <Select value={String(filters.limit)} onValueChange={(v) => setFilters({ ...filters, limit: parseInt(v, 10) })}>
                <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 lines</SelectItem>
                  <SelectItem value="100">100 lines</SelectItem>
                  <SelectItem value="200">200 lines</SelectItem>
                  <SelectItem value="500">500 lines</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={loadLogs}>
                <RefreshCw className="w-4 h-4" />Refresh
              </Button>
              <Badge variant={connected ? 'success' : 'secondary'} className="flex items-center gap-1">
                <Radio className="w-3 h-3" />
                {connected ? 'Live' : 'Historical'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0" style={{ height: 'calc(100vh - 300px)', minHeight: 400 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full bg-zinc-950 rounded-md text-zinc-500 text-sm">
            Loading logs...
          </div>
        ) : (
          <LogViewer logs={logs} onJumpToBottom={() => {}} showJumpButton={true} />
        )}
      </div>
    </div>
  );
}
