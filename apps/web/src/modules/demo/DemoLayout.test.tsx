import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoLayout } from './DemoLayout';

vi.mock('@/modules/traffic/stores/trafficStore', () => ({
  useTrafficStore: { getState: () => ({ cleanup: vi.fn() }) },
}));

const session = { boardId: 'guest-one', expiresAt: '2099-11-05T10:00:00Z', aiRemaining: 3, aiAvailable: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function setup(path = '/') {
  const router = createMemoryRouter([{ element: <DemoLayout />, children: [
    { path: '*', element: <div>Private board</div> },
  ] }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe('guest demo', () => {
  it('waits for explicit start and opens only the server-issued board', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(session));
    vi.stubGlobal('fetch', fetchMock);
    const router = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Uruchom demo' }));
    await screen.findByText('Private board');
    expect(router.state.location.pathname).toBe('/diablo-board/guest-one');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('replaces another guest board URL with its own session board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(session)));
    const router = setup('/board/someone-else');
    await screen.findByText('Private board');
    expect(router.state.location.pathname).toBe('/board/guest-one');
  });

  it('requires confirmation before reset and uses the rotated board without renewing the quota', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({ ...session, boardId: 'guest-two', aiRemaining: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const router = setup('/diablo-board/guest-one');
    fireEvent.click(await screen.findByRole('button', { name: 'Reset demo' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Przywróć dane startowe' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/diablo-board/guest-two'));
    expect(await screen.findByText(/Pozostałe analizy AI: 1/)).toBeInTheDocument();
  });

  it('does not create a guest on a failed initial request', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie udało się połączyć');
    expect(screen.queryByText('Private board')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
