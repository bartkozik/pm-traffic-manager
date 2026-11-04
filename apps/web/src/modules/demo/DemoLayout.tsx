import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { demoSessionResponseSchema as sessionSchema, type DemoSessionResponse as Session } from '@ptm/contracts';
import { apiBaseUrl, AUTH_REQUIRED_EVENT } from '@/core/api/apiClient';
import { useTrafficStore } from '@/modules/traffic/stores/trafficStore';
import { DEMO_REFRESH_EVENT, DEMO_RESET_EVENT } from './demoRuntime';
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
    ? 'Demo osiągnęło chwilowy limit. Spróbuj ponownie za kilka minut.'
    : 'Nie udało się połączyć z demo. Spróbuj ponownie.');
  return sessionSchema.parse(await response.json());
}

export function DemoLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const operation = useRef(0);
  const location = useLocation();

  const changeSession = useCallback(async (action: 'load' | 'start' | 'reset', signal?: AbortSignal) => {
    const id = ++operation.current;
    setBusy(true);
    setError('');
    setConfirmReset(false);
    useTrafficStore.getState().cleanup();
    try {
      const next = await requestSession(action, signal);
      if (id === operation.current && !signal?.aborted) setSession(next);
    } catch (cause) {
      if (id === operation.current && !signal?.aborted) {
        setError(cause instanceof Error && cause.message.startsWith('Demo osiągnęło')
          ? cause.message : 'Nie udało się połączyć z demo. Spróbuj ponownie.');
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
      setBusy(false);
      setError('Sesja wygasła. Uruchom nowe demo, aby wrócić do danych startowych.');
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

  if (!session) return <main className="demo-intro">
    <a href="https://kozikowski.it/projects/pm-traffic-manager">← Portfolio</a>
    <p className="demo-label">INTERACTIVE DEMO</p>
    <h1>PM Traffic Manager</h1>
    <p>Twoja prywatna tablica do planowania zespołu. Bez konta, bez danych klientów.</p>
    <ol>
      <li>Przeciągnij kafelki osób do projektów i sprawdź obciążenie.</li>
      <li>Porównaj koszty i przychody albo otwórz analizę AI.</li>
      <li>Eksperymentuj — reset odtworzy dane tylko w Twojej sesji.</li>
    </ol>
    <p>Wyłącznie fikcyjne dane. Sesja trwa do 24 godzin. Nie wpisuj danych osobowych ani poufnych.
      Analizy AI są opcjonalne, limitowane i wysyłają dane tablicy do OpenAI.</p>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void changeSession('start')}>{busy ? 'Ładowanie…' : 'Uruchom demo'}</button>
    <p className="demo-credit">Designed and developed end to end with AI-assisted development.</p>
  </main>;

  const match = location.pathname.match(/^\/(board|diablo-board)\/([^/]+)(\/ai-planning)?$/);
  const target = `/${match?.[1] || 'diablo-board'}/${session.boardId}${match?.[3] || ''}`;
  return <>
    <aside className="demo-banner" aria-label="Sesja demo">
      <div><strong>DEMO · Fikcyjne dane</strong><span>Prywatna tablica · sesja do 24 h · Pozostałe analizy AI: {session.aiRemaining}</span>
        {session.aiAvailable === false && <span>AI jest obecnie niedostępne. Planowanie i obliczenia działają niezależnie.</span>}</div>
      <a href="https://kozikowski.it/projects/pm-traffic-manager">Portfolio ↗</a>
      <button disabled={busy} onClick={() => setConfirmReset((value) => !value)}>Reset demo</button>
      {confirmReset && <div className="demo-reset" role="group" aria-label="Potwierdzenie resetu">
        <span>Usunąć Twoje zmiany i odtworzyć dane? Limit AI pozostaje bez zmian.</span>
        <button onClick={() => void changeSession('reset')}>Przywróć dane startowe</button>
        <button onClick={() => setConfirmReset(false)}>Anuluj</button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </aside>
    {busy ? <p role="status">Przygotowanie tablicy…</p> : location.pathname !== target
      ? <Navigate to={target} replace />
      : <Suspense fallback={<p role="status">Ładowanie tablicy…</p>}><Outlet key={session.boardId} /></Suspense>}
  </>;
}
