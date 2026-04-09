import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import type { Deployment } from '../types';

export function useDeployments(repoId?: number) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeployments = useCallback(async () => {
    try {
      setLoading(true);
      const path = repoId ? `/api/repos/${repoId}/deployments` : '/api/deployments/recent';
      const response = await api.get(path);
      
      if (!response.ok) {
        throw new Error('Failed to fetch deployments');
      }
      
      const data = await response.json();
      setDeployments(data.deployments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    fetchDeployments();
    // Refresh every 10 seconds
    const interval = setInterval(fetchDeployments, 10000);
    return () => clearInterval(interval);
  }, [fetchDeployments]);

  return { deployments, loading, error, refetch: fetchDeployments };
}

export function useRecentDeployments() {
  return useDeployments();
}
