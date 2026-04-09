import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Repositories from './pages/Repositories';
import DeploymentDetail from './pages/DeploymentDetail';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';
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

  return (
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
            <Route path="/settings" element={<Settings user={user} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
