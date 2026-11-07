'use client';

// Shown when the event can't be loaded (for example the database is unreachable). Unknown events and
// rejected organiser links are 404s, not errors.
export default function EventError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="su">
      <header className="wrap header">
        <a className="wordmark" href="/" aria-label="showup. home">
          showup
          <span className="dot">.</span>
        </a>
      </header>
      <main className="wrap page-main">
        <div className="col-grid">
          <div className="col-main">
            <h1 className="display">We couldn&apos;t load this event.</h1>
            <p className="j-org s-head">Try again in a moment.</p>
            <div className="j-form s-body">
              <div>
                <button type="button" className="btn btn-primary" onClick={() => retry()}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
