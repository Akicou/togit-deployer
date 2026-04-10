import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { User, Settings as SettingsType, AccessRequest } from '../types';

interface SystemConfig {
  github_oauth: boolean;
  localtonet: boolean;
  admin_github_login: boolean;
}

export default function Settings({ user }: { user: User }) {
  const [settings, setSettings] = useState<SettingsType>({ poll_interval_seconds: 60 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [savingPat, setSavingPat] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    loadSettings(); loadSystemConfig();
    if (isAdmin) { loadUsers(); loadAccessRequests(); }
  }, [isAdmin]);

  async function loadSettings() {
    try {
      const r = await api.get('/api/settings');
      if (r.ok) { const d = await r.json(); setSettings(d.settings); }
    } finally { setLoading(false); }
  }

  async function loadUsers() {
    try { const r = await api.get('/api/users'); if (r.ok) { const d = await r.json(); setUsers(d.users); } } catch {}
  }

  async function loadAccessRequests() {
    try { const r = await api.get('/api/access-requests'); if (r.ok) { const d = await r.json(); setAccessRequests(d.access_requests || []); } } catch {}
  }

  async function loadSystemConfig() {
    try { const r = await api.get('/api/system/config'); if (r.ok) { const d = await r.json(); setSystemConfig(d.config); } } catch {}
  }

  async function handleSaveSettings() {
    setSaving(true); setMessage(null);
    try {
      const r = await api.patch('/api/settings', settings);
      setMessage(r.ok ? { type: 'success', text: 'Settings saved' } : { type: 'error', text: 'Failed to save settings' });
    } catch { setMessage({ type: 'error', text: 'Failed to save settings' }); }
    finally { setSaving(false); }
  }

  async function handleSavePat() {
    if (!patInput.trim()) return;
    setSavingPat(true); setMessage(null);
    try {
      const r = await api.patch('/api/settings', { github_pat: patInput.trim() });
      if (r.ok) { setSettings((s) => ({ ...s, github_pat_set: true })); setPatInput(''); setMessage({ type: 'success', text: 'GitHub PAT saved' }); }
      else { setMessage({ type: 'error', text: 'Failed to save PAT' }); }
    } catch { setMessage({ type: 'error', text: 'Failed to save PAT' }); }
    finally { setSavingPat(false); }
  }

  async function handleClearPat() {
    setSavingPat(true);
    try {
      const r = await api.patch('/api/settings', { github_pat: null });
      if (r.ok) { setSettings((s) => ({ ...s, github_pat_set: false })); setMessage({ type: 'success', text: 'PAT cleared' }); }
    } finally { setSavingPat(false); }
  }

  async function handleUpdateRole(userId: number, role: string) {
    try {
      const r = await api.patch(`/api/users/${userId}`, { role });
      if (r.ok) { loadUsers(); setMessage({ type: 'success', text: 'Role updated' }); }
    } catch {}
  }

  async function handleAccessAction(userId: number, action: string) {
    try {
      let r: Response;
      if (action === 'kick') r = await api.post(`/api/access-requests/${userId}/kick`);
      else if (action === 'unban') r = await api.post(`/api/access-requests/${userId}/unban`);
      else r = await api.patch(`/api/access-requests/${userId}`, { status: action });
      if (r.ok) { loadUsers(); loadAccessRequests(); setMessage({ type: 'success', text: `Action successful` }); }
      else { const d = await r.json(); setMessage({ type: 'error', text: d.error || 'Action failed' }); }
    } catch { setMessage({ type: 'error', text: 'Action failed' }); }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading settings...</div>;
  if (!isAdmin) return <div className="flex items-center justify-center py-20 text-muted-foreground">You do not have permission to access settings.</div>;

  const pendingCount = accessRequests.filter(a => a.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure deployment scheduler and manage users</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="access">
            Access Requests
            {pendingCount > 0 && <Badge variant="destructive" className="ml-2 text-xs">{pendingCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">General Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Poll Interval (seconds)</Label>
                  <Input
                    type="number" min="10" max="3600"
                    value={settings.poll_interval_seconds}
                    onChange={(e) => setSettings({ ...settings, poll_interval_seconds: parseInt(e.target.value, 10) || 60 })}
                  />
                  <p className="text-xs text-muted-foreground">How often to check GitHub for new releases or commits</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>GitHub PAT (Fallback Token)</Label>
                  {settings.github_pat_set && (
                    <div className="flex items-center justify-between p-2 rounded-md bg-green-50 border border-green-200">
                      <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />Token configured
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleClearPat} disabled={savingPat}>
                        Clear
                      </Button>
                    </div>
                  )}
                  <Input
                    type="password" value={patInput}
                    onChange={(e) => setPatInput(e.target.value)}
                    placeholder={settings.github_pat_set ? 'Paste new token to replace...' : 'ghp_xxxxxxxxxxxxxxxxxxxx'}
                  />
                  <p className="text-xs text-muted-foreground">Needs <code>repo</code> scope. Used as fallback for private repos.</p>
                  <Button size="sm" onClick={handleSavePat} disabled={savingPat || !patInput.trim()}>
                    {savingPat ? <><Loader2 className="w-3 h-3 animate-spin" />Saving...</> : 'Save PAT'}
                  </Button>
                </div>

                <Separator />

                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Save Settings'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Environment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'GitHub OAuth',  ok: systemConfig?.github_oauth },
                  { label: 'Localtonet',    ok: systemConfig?.localtonet,   extra: <TestConnectionButton /> },
                  { label: 'Admin User',    ok: systemConfig?.admin_github_login },
                  { label: 'Database',      ok: true },
                ].map(({ label, ok, extra }) => (
                  <div key={label} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                    <span className="text-sm font-medium">{label}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={ok ? 'success' : 'destructive'} className="text-xs">
                        {ok ? 'Configured' : 'Not Configured'}
                      </Badge>
                      {extra}
                    </div>
                  </div>
                ))}

                {!systemConfig?.localtonet && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs space-y-1">
                      <p className="font-semibold">Localtonet token not configured</p>
                      <p>Add <code>LOCALTONET_AUTH_TOKEN</code> to your .env file and restart the server.</p>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Users ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No users yet</p>
              ) : (
                <div className="space-y-2">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-md border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                          {u.github_login.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{u.github_login}</p>
                          <p className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={u.access_level === 'approved' ? 'success' : 'outline'} className="text-xs capitalize">
                          {u.access_level}
                        </Badge>
                        {u.id === user.id ? (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        ) : (
                          <>
                            <Select value={u.role} onValueChange={(role) => handleUpdateRole(u.id, role)}>
                              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="deployer">Deployer</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                            {u.access_level === 'approved' && (
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(u.id, 'blocked')}>Kick</Button>
                            )}
                            {u.access_level === 'banned' && (
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(u.id, 'unban')}>Unban</Button>
                            )}
                            {u.access_level === 'blocked' && (
                              <>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(u.id, 'approved')}>Approve</Button>
                                <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(u.id, 'banned')}>Ban</Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Access Requests Tab */}
        <TabsContent value="access" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {accessRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No access requests</p>
              ) : (
                <div className="space-y-2">
                  {accessRequests.map((ar) => (
                    <div key={ar.id} className="flex items-center justify-between p-3 rounded-md border">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
                          {ar.github_login.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{ar.github_login}</p>
                          <p className="text-xs text-muted-foreground">{new Date(ar.requested_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ar.status === 'approved' ? 'success' : ar.status === 'pending' ? 'secondary' : 'destructive'} className="text-xs capitalize">
                          {ar.status}
                        </Badge>
                        {ar.status === 'pending' && (
                          <>
                            <Button size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(ar.user_id, 'approved')}>Approve</Button>
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(ar.user_id, 'blocked')}>Block</Button>
                            <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => handleAccessAction(ar.user_id, 'banned')}>Ban</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TestConnectionButton() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string; activeTunnelsCount?: number } | null>(null);

  async function handleTest() {
    setTesting(true); setResult(null);
    try {
      const r = await api.post('/api/tunnels/test');
      const d = await r.json();
      setResult(d);
    } catch { setResult({ success: false, error: 'Network error' }); }
    finally { setTesting(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleTest} disabled={testing}>
        {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
      </Button>
      {result && (
        <span className={`text-xs font-medium flex items-center gap-1 ${result.success ? 'text-green-600' : 'text-red-600'}`}>
          {result.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {result.success ? `${result.activeTunnelsCount ?? 0} active` : result.error}
        </span>
      )}
    </div>
  );
}
