import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import type { User } from '../types';

interface SidebarProps {
  user: User;
  onLogout: () => void;
}

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { path: '/repositories', label: 'Repositories', icon: RepoIcon },
  { path: '/tunnels', label: 'Tunnels', icon: TunnelsIcon },
  { path: '/logs', label: 'Logs', icon: LogsIcon },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const navigate = useNavigate();

  async function handleLogout() {
    await api.post('/api/auth/logout');
    onLogout();
    navigate('/login');
  }

  return (
    <motion.aside
      initial={{ x: -260 }}
      animate={{ x: 0 }}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 260,
        height: '100vh',
        background: '#f5f5f5',
        borderRight: '4px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '28px 24px',
        borderBottom: '2px solid #1a1a1a',
        background: '#ffffff',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 36,
            height: 36,
            background: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a1a1a', letterSpacing: '-0.5px' }}>TOGIT</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '24px 16px' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 16px',
              marginBottom: 8,
              border: '2px solid #1a1a1a',
              background: isActive ? '#1a1a1a' : '#ffffff',
              color: isActive ? '#ffffff' : '#1a1a1a',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: 14,
              transition: 'all 0.1s ease',
              boxShadow: isActive ? '4px 4px 0 #1a1a1a' : '2px 2px 0 #1a1a1a',
            })}
          >
            <item.icon />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div style={{
        padding: '24px',
        borderTop: '2px solid #1a1a1a',
        background: '#ffffff',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}>
          <div style={{
            width: 36,
            height: 36,
            border: '2px solid #1a1a1a',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            color: '#1a1a1a',
          }}>
            {user.github_login.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1a' }}>
              {user.github_login}
            </div>
            <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
              {user.role}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #1a1a1a',
            background: '#1a1a1a',
            color: '#ffffff',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            boxShadow: '4px 4px 0 #1a1a1a',
            transition: 'all 0.1s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.boxShadow = '2px 2px 0 #1a1a1a';
            e.currentTarget.style.transform = 'translate(2px, 2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.boxShadow = '4px 4px 0 #1a1a1a';
            e.currentTarget.style.transform = 'translate(0, 0)';
          }}
        >
          Sign Out
        </button>
      </div>
    </motion.aside>
  );
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

function TunnelsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
