import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Repositories from './pages/Repositories';
import DeploymentDetail from './pages/DeploymentDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Tunnels from './pages/Tunnels';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { api } from './lib/api';
import type { User } from './types';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Loader2, Menu } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    checkAuth();
    // Close sidebar on route change for mobile
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  async function checkAuth() {
    try {
      const response = await api.get('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={checkAuth} />;
  }

  if (user.access_level !== 'approved') {
    return <AccessPending user={user} onRecheck={checkAuth} />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-background">
          {/* Mobile overlay */}
          {sidebarOpen && window.innerWidth < 1024 && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          
          {/* Sidebar */}
          <Sidebar 
            user={user} 
            onLogout={checkAuth} 
            isOpen={sidebarOpen} 
            onClose={() => setSidebarOpen(false)} 
          />
          
          {/* Main content */}
          <main className="flex-1 min-h-screen">
            {/* Mobile header */}
            <header className="lg:hidden sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <span className="font-bold">Togit</span>
              <div className="w-9" />
            </header>
            
            <div className="p-4 lg:p-8">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard user={user} />} />
                <Route path="/projects" element={<Projects user={user} />} />
                <Route path="/projects/:id" element={<Projects user={user} />} />
                <Route path="/repositories" element={<Repositories user={user} />} />
                <Route path="/repositories/:id" element={<Repositories user={user} />} />
                <Route path="/deployments/:id" element={<DeploymentDetail user={user} />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/tunnels" element={<Tunnels />} />
                <Route path="/settings" element={<Settings user={user} />} />
              </Routes>
            </div>
          </main>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

function AccessPending({ user, onRecheck }: { user: User; onRecheck: () => void }) {
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');

  async function handleRequestAccess() {
    try {
      const response = await api.post('/api/access-requests');
      if (response.ok) {
        setRequested(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to request access');
        if (data.error === 'Access request already pending for this user') setRequested(true);
      }
    } catch {
      setError('Network error');
    }
  }

  const statusMessage: Record<string, string> = {
    pending: requested ? 'Your access request is pending admin approval.' : 'Your account is awaiting approval.',
    blocked: 'Your access has been restricted. Contact an administrator.',
    banned:  'Your account has been banned.',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold mx-auto mb-3">
            {user.github_login.charAt(0).toUpperCase()}
          </div>
          <CardTitle className="text-2xl">Access Required</CardTitle>
          <p className="text-sm text-muted-foreground">Signed in as <strong>{user.github_login}</strong></p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-md bg-muted text-sm text-center font-medium">
            {statusMessage[user.access_level] || statusMessage.pending}
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          {!requested && user.access_level === 'pending' && (
            <Button className="w-full" onClick={handleRequestAccess}>
              Request Access
            </Button>
          )}

          {requested && (
            <Button variant="outline" className="w-full" onClick={onRecheck}>
              Check Again
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={async () => { await api.post('/api/auth/logout'); onRecheck(); }}
          >
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
