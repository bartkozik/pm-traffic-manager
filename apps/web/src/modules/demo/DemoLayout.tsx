import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { demoSessionResponseSchema as sessionSchema, type DemoSessionResponse as Session } from '@ptm/contracts';
import { apiBaseUrl, AUTH_REQUIRED_EVENT } from '@/core/api/apiClient';
import { useTrafficStore } from '@/modules/traffic/stores/trafficStore';
import { DEMO_REFRESH_EVENT, DEMO_RESET_EVENT } from './demoRuntime';
import { DemoGuide } from './DemoGuide';
import { DemoToolbar } from './DemoToolbar';
import './demo.css';


async function requestSession(action: 'load' | 'start' | 'reset', signal?: AbortSignal): Promise<Session | null> {
  const response = await fetch(`${apiBaseUrl}/demo/${action === 'reset' ? 'reset' : 'session'}`, {
    method: action === 'load' ? 'GET' : 'POST',
    credentials: 'include',
    headers: action === 'load' ? undefined : { 'content-type': 'application/json' },
    body: action === 'load' ? undefined : '{}',
    signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(response.status === 429
    ? 'The demo has reached its temporary limit. Please try again in a few minutes.'
    : 'Could not connect to the demo. Please try again.');
  return sessionSchema.parse(await response.json());
}

export function DemoLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButton = useRef<HTMLButtonElement>(null);
  const operation = useRef(0);
  const location = useLocation();

  const changeSession = useCallback(async (action: 'load' | 'start' | 'reset', signal?: AbortSignal) => {
    const id = ++operation.current;
    setBusy(true);
    setError('');
    setConfirmReset(false);
    setGuideOpen(false);
    useTrafficStore.getState().cleanup();
    try {
      const next = await requestSession(action, signal);
      if (id === operation.current && !signal?.aborted) {
        setSession(next);
        if (action === 'start' && next) setGuideOpen(true);
      }
    } catch (cause) {
      if (id === operation.current && !signal?.aborted) {
        setError(cause instanceof Error && cause.message.startsWith('The demo has reached')
          ? cause.message : 'Could not connect to the demo. Please try again.');
      }
    } finally {
      if (id === operation.current && !signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void changeSession('load', controller.signal);
    return () => { controller.abort(); useTrafficStore.getState().cleanup(); };
  }, [changeSession]);

  useEffect(() => {
    const expire = () => {
      ++operation.current;
      useTrafficStore.getState().cleanup();
      setSession(null);
      setGuideOpen(false);
      setBusy(false);
      setError('Your session has expired. Open a new demo to restore the sample data.');
    };
    const reset = () => setConfirmReset(true);
    const refresh = async () => {
      const id = operation.current;
      try {
        const next = await requestSession('load');
        if (id === operation.current) setSession(next);
      } catch { return; }
    };
    const ttl = session ? Math.max(0, Date.parse(session.expiresAt) - Date.now()) : null;
    const timer = ttl === null ? undefined : window.setTimeout(expire, Math.min(ttl, 2_147_483_647));
    window.addEventListener(AUTH_REQUIRED_EVENT, expire);
    window.addEventListener(DEMO_RESET_EVENT, reset);
    window.addEventListener(DEMO_REFRESH_EVENT, refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(AUTH_REQUIRED_EVENT, expire);
      window.removeEventListener(DEMO_RESET_EVENT, reset);
      window.removeEventListener(DEMO_REFRESH_EVENT, refresh);
    };
  }, [session]);

  const closeGuide = () => {
    setGuideOpen(false);
    window.requestAnimationFrame(() => guideButton.current?.focus());
  };

  if (!session) return <main className="demo-intro">
    <a href="https://kozikowski.it/projects/pm-traffic-manager">← Portfolio</a>
    <p className="demo-label">INTERACTIVE DEMO</p>
    <h1>PM Traffic Manager</h1>
    <p>Your own team planning board. No account or real client data required.</p>
    <ol>
      <li>Drag people’s capacity tiles into projects and check their workload.</li>
      <li>Compare costs and revenue, or try an AI analysis.</li>
      <li>Experiment freely — resetting restores the sample data in your session only.</li>
    </ol>
    <p>All data is fictional. Sessions last up to 24 hours. Do not enter personal or confidential information.
      AI analyses are optional and limited. Running an analysis sends your board data to OpenAI.</p>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void changeSession('start')}>{busy ? 'Loading…' : 'Open demo'}</button>
    <p className="demo-credit">Designed and developed end to end with AI-assisted development.</p>
  </main>;

  const match = location.pathname.match(/^\/(board|diablo-board)\/([^/]+)(\/ai-planning)?$/);
  const target = `/${match?.[1] || 'diablo-board'}/${session.boardId}${match?.[3] || ''}`;
  return <>
    <DemoToolbar
      projectName="PM Traffic Manager"
      portfolioUrl="https://kozikowski.it/projects/pm-traffic-manager"
      busy={busy}
      guideButtonRef={guideButton}
      onOpenGuide={() => setGuideOpen(true)}
      onReset={() => setConfirmReset((value) => !value)}
      details={<>
        <span>AI analyses remaining: {session.aiRemaining}</span>
        {session.aiAvailable === false && <span>AI is currently unavailable. Planning and calculations remain available.</span>}
      </>}
    />
    {confirmReset && <div className="demo-reset" role="group" aria-label="Confirm reset">
      <span>Discard your changes and restore the sample data? Your AI limit will not reset.</span>
      <button onClick={() => void changeSession('reset')}>Restore sample data</button>
      <button onClick={() => setConfirmReset(false)}>Cancel</button>
    </div>}
    {error && <p className="demo-notice" role="alert">{error}</p>}
    {guideOpen && !busy && location.pathname === target && <DemoGuide onClose={closeGuide} />}
    {busy ? <p role="status">Preparing your board…</p> : location.pathname !== target
      ? <Navigate to={target} replace />
      : <Suspense fallback={<p role="status">Loading your board…</p>}><Outlet key={session.boardId} /></Suspense>}
  </>;
}
