export const AUTH_REQUIRED_EVENT = 'ptm:auth-required';

export const apiBaseUrl = (import.meta.env.VITE_PTM_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  }

  return response;
}
