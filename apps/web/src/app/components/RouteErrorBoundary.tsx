import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import './RouteErrorBoundary.css';

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Nieznany blad aplikacji.';
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = getErrorMessage(error);

  return (
    <main className="route-error-page">
      <section className="route-error-panel" aria-labelledby="route-error-title">
        <p className="route-error-eyebrow">PTM recovery</p>
        <h1 id="route-error-title">Nie udalo sie zaladowac widoku</h1>
        <p className="route-error-message">
          Aplikacja zatrzymala renderowanie tej trasy. Mozesz wrocic do glownego boardu albo odswiezyc widok,
          zeby sprobowac ponownie.
        </p>
        <pre className="route-error-details">{message}</pre>
        <div className="route-error-actions">
          <Link className="route-error-button is-primary" to="/diablo-board/ptm-mvp">
            Wroc do boardu
          </Link>
          <button className="route-error-button" type="button" onClick={() => window.location.reload()}>
            Odswiez widok
          </button>
        </div>
      </section>
    </main>
  );
}
