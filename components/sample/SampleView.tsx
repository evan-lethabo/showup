// Ported mechanically from Event.dc.html (whole template). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import ProposalNotice from '../shared/ProposalNotice';
import ReminderPanel from '../shared/ReminderPanel';
import DotRows from '../shared/DotRows';
import ProposeSheet from './ProposeSheet';
import { Fragment } from 'react';

export default function SampleView({ v }: { v: any }) {
  return (
    <>
      <div className="su">
        <div className="ambient" aria-hidden="true" />
        <div className="layer">
          <header className="wrap header">
            {/* Plain <a>, not next/link: a full page load keeps Main's and Event's CSS apart. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="wordmark" href="/" aria-label="showup. home">
              showup
              <span className="dot">.</span>
            </a>
            <p className="status">{v.statusLabel}</p>
          </header>
          <main className="wrap e-main">
            <div className="e-grid">
              <div className="e-title">
                <p className="label e-kicker">Sample event</p>
                <h1 className="display">Weekend plans</h1>
                <p className="e-count">8 responses</p>
              </div>
              <section className="e-rec" aria-labelledby="rec-label">
                <p id="rec-label" className="label-red">
                  Best so far
                </p>
                <p className="rec-time">
                  <span>Saturday</span>
                  <span className="comma">, </span>
                  <span className="t2">7 – 11pm</span>
                </p>
                <p className="rec-date">Sat 24 Oct</p>
                <p className="comp-h rec-viable">6 people could make this work.</p>
              </section>
              <section className="e-dots" aria-label="Days compared">
                <DotRows v={v} />
              </section>
              <aside className="e-side" aria-label="Organiser tools">
                <section className="glass e-share" aria-label="Event link">
                  <div className="share-text">
                    <p className="share-link" title="Prototype URL, not a live link" ref={v.setLinkEl}>
                      showup.example/e/7Q4KX2
                    </p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={v.copyLink}>
                      Copy link
                    </button>
                    <p className="small copy-msg" role="status" aria-live="polite">
                      {v.linkMsg}
                    </p>
                  </div>
                  <svg className="qr" viewBox="-2 -2 33 33" role="img" aria-label="QR code for the event link" shapeRendering="crispEdges">
                    <rect x="-2" y="-2" width="33" height="33" fill="#FFFFFF" />
                    <path
                      fill="#333333"
                      d="M0 0h7v1h-7zM8 0h2v1h-2zM11 0h5v1h-5zM18 0h1v1h-1zM20 0h1v1h-1zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h2v1h-2zM11 1h5v1h-5zM17 1h1v1h-1zM19 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h3v1h-3zM12 2h3v1h-3zM19 2h2v1h-2zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM10 3h2v1h-2zM14 3h2v1h-2zM17 3h1v1h-1zM20 3h1v1h-1zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h2v1h-2zM11 4h3v1h-3zM15 4h1v1h-1zM17 4h3v1h-3zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM13 5h2v1h-2zM17 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM11 7h2v1h-2zM14 7h1v1h-1zM19 7h1v1h-1zM0 8h1v1h-1zM3 8h8v1h-8zM13 8h6v1h-6zM21 8h1v1h-1zM24 8h1v1h-1zM26 8h3v1h-3zM1 9h2v1h-2zM5 9h1v1h-1zM7 9h1v1h-1zM9 9h3v1h-3zM14 9h1v1h-1zM17 9h3v1h-3zM21 9h1v1h-1zM23 9h2v1h-2zM26 9h2v1h-2zM1 10h1v1h-1zM3 10h2v1h-2zM6 10h4v1h-4zM11 10h2v1h-2zM14 10h1v1h-1zM20 10h1v1h-1zM26 10h1v1h-1zM0 11h1v1h-1zM3 11h2v1h-2zM8 11h1v1h-1zM12 11h1v1h-1zM14 11h2v1h-2zM17 11h1v1h-1zM21 11h2v1h-2zM24 11h2v1h-2zM28 11h1v1h-1zM4 12h3v1h-3zM8 12h3v1h-3zM12 12h3v1h-3zM18 12h2v1h-2zM22 12h1v1h-1zM28 12h1v1h-1zM0 13h1v1h-1zM4 13h2v1h-2zM10 13h2v1h-2zM21 13h8v1h-8zM1 14h1v1h-1zM6 14h1v1h-1zM8 14h1v1h-1zM10 14h3v1h-3zM14 14h2v1h-2zM17 14h1v1h-1zM19 14h5v1h-5zM26 14h1v1h-1zM28 14h1v1h-1zM3 15h3v1h-3zM7 15h1v1h-1zM10 15h5v1h-5zM16 15h1v1h-1zM22 15h2v1h-2zM26 15h1v1h-1zM28 15h1v1h-1zM4 16h3v1h-3zM9 16h1v1h-1zM11 16h1v1h-1zM15 16h1v1h-1zM17 16h1v1h-1zM19 16h3v1h-3zM23 16h1v1h-1zM25 16h1v1h-1zM0 17h2v1h-2zM3 17h2v1h-2zM8 17h1v1h-1zM10 17h1v1h-1zM17 17h1v1h-1zM19 17h2v1h-2zM24 17h1v1h-1zM26 17h2v1h-2zM0 18h2v1h-2zM3 18h2v1h-2zM6 18h1v1h-1zM10 18h1v1h-1zM12 18h3v1h-3zM16 18h4v1h-4zM23 18h3v1h-3zM28 18h1v1h-1zM0 19h2v1h-2zM5 19h1v1h-1zM7 19h4v1h-4zM12 19h2v1h-2zM15 19h2v1h-2zM19 19h2v1h-2zM22 19h1v1h-1zM25 19h2v1h-2zM0 20h9v1h-9zM12 20h2v1h-2zM16 20h12v1h-12zM8 21h3v1h-3zM13 21h1v1h-1zM16 21h1v1h-1zM20 21h1v1h-1zM24 21h2v1h-2zM0 22h7v1h-7zM8 22h1v1h-1zM12 22h2v1h-2zM15 22h1v1h-1zM17 22h1v1h-1zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h2v1h-2zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h2v1h-2zM11 23h3v1h-3zM15 23h6v1h-6zM24 23h1v1h-1zM27 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM8 24h1v1h-1zM11 24h3v1h-3zM15 24h1v1h-1zM17 24h1v1h-1zM19 24h7v1h-7zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h3v1h-3zM14 25h2v1h-2zM17 25h5v1h-5zM27 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM10 26h1v1h-1zM15 26h7v1h-7zM23 26h2v1h-2zM26 26h3v1h-3zM0 27h1v1h-1zM6 27h1v1h-1zM10 27h1v1h-1zM13 27h2v1h-2zM16 27h1v1h-1zM19 27h1v1h-1zM21 27h3v1h-3zM25 27h2v1h-2zM28 27h1v1h-1zM0 28h7v1h-7zM8 28h7v1h-7zM16 28h2v1h-2zM19 28h2v1h-2zM23 28h3v1h-3z"
                    />
                  </svg>
                </section>
                <section className="e-actions" aria-label="Organiser actions">
                  <div className="btn-row">
                    <button type="button" className="btn btn-primary propose-inline" onClick={v.openPropose}>
                      {v.proposeLabel}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={v.toggleReminder} aria-expanded={v.reminderExpanded}>
                      Draft reminder
                    </button>
                  </div>
                  {v.hasProposal ? (
                    <>
                      <ProposalNotice v={v} />
                    </>
                  ) : null}
                  {v.reminderOpen ? (
                    <>
                      <ReminderPanel v={v} />
                    </>
                  ) : null}
                </section>
              </aside>
              <section className="e-people" aria-labelledby="people-h">
                <h2 id="people-h" className="comp-h">
                  Responses
                </h2>
                <div className="avatars">
                  {(v.people || []).map((p: any, $index: number) => (
                    <Fragment key={$index}>
                      <button type="button" className={p.cls} aria-label={p.aria} aria-pressed={p.pressed} onClick={p.toggle}>
                        <span aria-hidden="true">{p.initial}</span>
                        <span className="av-tip" aria-hidden="true">
                          {p.tip}
                        </span>
                      </button>
                    </Fragment>
                  ))}
                </div>
              </section>
            </div>
          </main>
          <footer className="wrap e-foot">
            <p className="small">
              Prototype: a sample event with fixed, fictional responses. Answers on the Respond screen don't change it.
            </p>
            {/* Plain <a>, not next/link: a full page load keeps Main's and Event's CSS apart. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-btn" href="/">
              Back
            </a>
          </footer>
          <div className="m-bar glass">
            <button type="button" className="btn btn-primary" onClick={v.openPropose}>
              {v.proposeLabel}
            </button>
          </div>
          {v.proposeOpen ? <ProposeSheet v={v} /> : null}
        </div>
      </div>
    </>
  );
}
