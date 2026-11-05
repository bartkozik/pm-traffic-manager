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

  return 'Unknown application error.';
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const message = getErrorMessage(error);

  return (
    <main className="route-error-page">
      <section className="route-error-panel" aria-labelledby="route-error-title">
        <p className="route-error-eyebrow">PTM recovery</p>
        <h1 id="route-error-title">Could not load this view</h1>
        <p className="route-error-message">
          This view could not be displayed. Return to the board or reload the page to try again.
        </p>
        <pre className="route-error-details">{message}</pre>
        <div className="route-error-actions">
          <Link className="route-error-button is-primary" to="/diablo-board/ptm-mvp">
            Back to board
          </Link>
          <button className="route-error-button" type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </div>
      </section>
    </main>
  );
}
