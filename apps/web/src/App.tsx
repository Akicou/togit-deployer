import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Repositories from './pages/Repositories';
import DeploymentDetail from './pages/DeploymentDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Tunnels from './pages/Tunnels';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { api } from './lib/api';
import type { User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#ffffff',
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '2px solid #1a1a1a',
          background: '#1a1a1a',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={checkAuth} />;
  }

  // Show access request page for non-approved users
  if (user.access_level !== 'approved') {
    return <AccessPending user={user} onRecheck={checkAuth} />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar user={user} onLogout={checkAuth} />
          <main style={{
            flex: 1,
            marginLeft: 260,
            padding: '32px',
            background: '#ffffff',
          }}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard user={user} />} />
              <Route path="/repositories" element={<Repositories user={user} />} />
              <Route path="/repositories/:id" element={<Repositories user={user} />} />
              <Route path="/deployments/:id" element={<DeploymentDetail user={user} />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/tunnels" element={<Tunnels />} />
              <Route path="/settings" element={<Settings user={user} />} />
            </Routes>
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
        if (data.error === 'Access request already pending for this user') {
          setRequested(true);
        }
      }
    } catch {
      setError('Network error');
    }
  }

  const statusMessage: Record<string, string> = {
    pending: requested ? 'Your access request is pending admin approval.' : 'Your account is awaiting approval.',
    blocked: 'Your access has been restricted. Contact an administrator.',
    banned: 'Your account has been banned.',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
    }}>
      <div style={{
        background: '#ffffff',
        border: '4px solid #1a1a1a',
        padding: 48,
        textAlign: 'center',
        maxWidth: 440,
        width: '90%',
        boxShadow: '8px 8px 0 #1a1a1a',
      }}>
        <div style={{
          width: 64,
          height: 64,
          margin: '0 auto 24px',
          border: '3px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          color: '#1a1a1a',
          fontSize: 24,
        }}>
          {user.github_login.charAt(0).toUpperCase()}
        </div>

        <h1 style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#1a1a1a',
          marginBottom: 8,
          letterSpacing: '-1px',
        }}>
          ACCESS REQUIRED
        </h1>

        <p style={{
          color: '#666',
          fontSize: 14,
          marginBottom: 32,
          fontWeight: 600,
        }}>
          Signed in as <strong>{user.github_login}</strong>
        </p>

        <div style={{
          padding: 20,
          border: '3px solid #1a1a1a',
          background: '#f5f5f5',
          marginBottom: 28,
        }}>
          <p style={{
            color: '#1a1a1a',
            fontWeight: 700,
            fontSize: 14,
          }}>
            {statusMessage[user.access_level] || statusMessage.pending}
          </p>
        </div>

        {error && (
          <p style={{ color: '#1a1a1a', fontWeight: 700, marginBottom: 16, fontSize: 13 }}>{error}</p>
        )}

        {!requested && user.access_level === 'pending' && (
          <button
            onClick={handleRequestAccess}
            style={{
              padding: '16px 32px',
              border: '3px solid #1a1a1a',
              background: '#1a1a1a',
              color: '#ffffff',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 14,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              boxShadow: '6px 6px 0 #1a1a1a',
              transition: 'all 0.1s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '3px 3px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(3px, 3px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '6px 6px 0 #1a1a1a';
              e.currentTarget.style.transform = 'translate(0, 0)';
            }}
          >
            Request Access
          </button>
        )}

        {requested && (
          <button
            onClick={onRecheck}
            style={{
              padding: '12px 24px',
              border: '2px solid #1a1a1a',
              background: '#ffffff',
              color: '#1a1a1a',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Check Again
          </button>
        )}

        <button
          onClick={async () => { await api.post('/api/auth/logout'); onRecheck(); }}
          style={{
            display: 'block',
            margin: '24px auto 0',
            padding: '8px 16px',
            border: '2px solid #1a1a1a',
            background: 'transparent',
            color: '#666',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: 12,
            textTransform: 'uppercase',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
