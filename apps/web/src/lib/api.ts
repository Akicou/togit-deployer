const API_BASE = '';

export const api = {
  async get(path: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },

  async post<T = unknown>(path: string, data?: T): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async patch<T = unknown>(path: string, data?: T): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  async delete(path: string): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  },
};

export function createWebSocket(deploymentId?: number | 'all'): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const path = deploymentId ? `/ws/logs?deploymentId=${deploymentId}` : '/ws/logs';
  return new WebSocket(`${protocol}//${host}${path}`);
}
