// Tunnels page removed - tunnel management is now inline per deployment
// This page redirects to dashboard
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Tunnels() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/dashboard');
  }, [navigate]);
  
  return null;
}
