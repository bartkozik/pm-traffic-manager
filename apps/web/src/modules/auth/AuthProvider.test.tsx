import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import { loadAuthSession } from './authApi';

vi.mock('./authApi', () => ({
  loadAuthSession: vi.fn(),
  logoutFromPtm: vi.fn(),
}));

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.mocked(loadAuthSession).mockReset();
  });

  it('honors server-enabled auth even when the frontend build flag is disabled', async () => {
    vi.mocked(loadAuthSession).mockResolvedValue({
      authenticated: false,
      authEnabled: true,
      workspaceDomain: 'example.test',
    });

    render(
      <AuthProvider>
        <AuthGate><span>Board content</span></AuthGate>
      </AuthProvider>
    );

    expect(await screen.findByRole('heading', { name: 'Sign in to PTM' })).toBeInTheDocument();
    expect(screen.queryByText('Board content')).not.toBeInTheDocument();
  });

  it('preserves the local fallback when auth is not expected and the API is unavailable', async () => {
    vi.mocked(loadAuthSession).mockRejectedValue(new Error('API unavailable'));

    render(
      <AuthProvider>
        <AuthGate><span>Board content</span></AuthGate>
      </AuthProvider>
    );

    expect(await screen.findByText('Board content')).toBeInTheDocument();
  });

  it('returns to the login screen when background verification sees revoked access', async () => {
    vi.mocked(loadAuthSession)
      .mockResolvedValueOnce({
        authenticated: true,
        authEnabled: true,
        user: {
          email: 'admin@example.test',
          name: 'Admin User',
          organizationDomain: 'example.test',
          role: 'admin',
          subject: 'admin@example.test',
        },
        workspaceDomain: 'example.test',
      })
      .mockResolvedValueOnce({
        authenticated: false,
        authEnabled: true,
        workspaceDomain: 'example.test',
      });

    render(
      <AuthProvider>
        <AuthGate><span>Board content</span></AuthGate>
      </AuthProvider>
    );

    expect(await screen.findByText('Board content')).toBeInTheDocument();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByRole('heading', { name: 'Sign in to PTM' })).toBeInTheDocument();
  });
});
