import { MantineProvider } from '@mantine/core';
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
  render(<MantineProvider env="test"><RouterProvider router={router} /></MantineProvider>);
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe('guest demo', () => {
  it('guides a new guest through the basics without changing data or requesting AI', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(session));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Open demo' }));
    await screen.findByRole('dialog', { name: 'Demo guide' });
    expect(screen.getByRole('heading', { name: 'Assign people to projects' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Explore different time periods' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Assign people to projects' })).toBeInTheDocument();
    for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Experiment freely' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start planning' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lets a guest skip and reopen the guide from the beginning', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(session));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Open demo' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip guide' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Quick guide' }));
    expect(await screen.findByRole('heading', { name: 'Assign people to projects' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps a returning guest on the board and offers the guide on demand', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(session)));
    setup('/diablo-board/guest-one');
    await screen.findByText('Private board');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quick guide' }));
    await screen.findByRole('dialog', { name: 'Demo guide' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('waits for explicit start and opens only the server-issued board', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(session));
    vi.stubGlobal('fetch', fetchMock);
    const router = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Open demo' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Restore sample data' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/diablo-board/guest-two'));
    expect(await screen.findByText(/AI analyses remaining: 1/)).toBeInTheDocument();
  });

  it('does not create a guest on a failed initial request', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not connect');
    expect(screen.queryByText('Private board')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
