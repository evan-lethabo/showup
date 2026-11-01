// Ported mechanically from Main.dc.html (<sc-if> section). Values and handlers come from the page's
// renderVals() (see lib/ui), exactly as the template's {{holes}} did.
import ProposalNotice from '../../shared/ProposalNotice';
import ReminderPanel from '../../shared/ReminderPanel';
import RoundCard from '../../shared/RoundCard';
import DotRows from '../../shared/DotRows';
import LiveResults from '../../shared/LiveResults';
import InviteQr from '../../shared/InviteQr';
import { Fragment } from 'react';

export default function EventPage({ v }: { v: any }) {
  return (
    <>
      <header className="wrap header header-ev">
        <button type="button" className="wordmark" onClick={v.goHome} aria-label="showup. home">
          showup
          <span className="dot">.</span>
        </button>
        <p className="status">{v.evStatusLabel}</p>
      </header>
      <main className="wrap f-main">
        <div className={v.evGridCls}>
          <div className="ev-title">
            <h1 className="display vt-title" tabIndex={-1} ref={v.setHeadingEl}>{v.eventName}</h1>
            <p className="f-sub s-head">{v.countLine}</p>
            {v.hasEventDetails ? <p className="f-sub s-head">{v.eventDetails}</p> : null}
          </div>
          {v.showGuestStatus ? (
            <>
              <p className="ev-status s-head">{v.guestStatus}</p>
            </>
          ) : null}
          <LiveResults v={v} />
          <RoundCard v={v} />
          {v.showFresh ? (
            <>
              <section className="glass f-invite s-body" aria-label="Invite link">
                <div className="f-invite-text">
                  <p className="f-link" title={v.shareLinkTitle} ref={v.setLinkEl}>{v.shareLinkText}</p>
                  <div className="btn-row">
                    <button type="button" className="btn btn-secondary" onClick={v.copyLink}>Copy link</button>
                    <p className="small copy-msg" role="status" aria-live="polite">{v.linkMsg}</p>
                  </div>
                </div>
                {v.isPrototype ? (
<svg className="f-qr" viewBox="-2 -2 33 33" role="img" aria-label="QR code for the event link" shapeRendering="crispEdges">
                  <rect x="-2" y="-2" width="33" height="33" fill="#FFFFFF" />
                  <path fill="#333333" d="M0 0h7v1h-7zM8 0h1v1h-1zM10 0h3v1h-3zM15 0h5v1h-5zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h3v1h-3zM12 1h1v1h-1zM14 1h2v1h-2zM18 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM10 2h1v1h-1zM12 2h4v1h-4zM18 2h3v1h-3zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h2v1h-2zM11 3h1v1h-1zM16 3h2v1h-2zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM10 4h1v1h-1zM13 4h1v1h-1zM17 4h1v1h-1zM19 4h1v1h-1zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM9 5h4v1h-4zM14 5h1v1h-1zM18 5h2v1h-2zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM8 7h1v1h-1zM10 7h5v1h-5zM17 7h2v1h-2zM0 8h1v1h-1zM2 8h2v1h-2zM5 8h3v1h-3zM12 8h3v1h-3zM16 8h2v1h-2zM22 8h1v1h-1zM25 8h1v1h-1zM27 8h2v1h-2zM0 9h1v1h-1zM3 9h1v1h-1zM7 9h2v1h-2zM10 9h2v1h-2zM15 9h6v1h-6zM22 9h3v1h-3zM28 9h1v1h-1zM0 10h3v1h-3zM4 10h4v1h-4zM9 10h1v1h-1zM14 10h2v1h-2zM18 10h1v1h-1zM20 10h2v1h-2zM24 10h1v1h-1zM26 10h2v1h-2zM0 11h5v1h-5zM9 11h2v1h-2zM13 11h3v1h-3zM18 11h2v1h-2zM21 11h3v1h-3zM28 11h1v1h-1zM1 12h2v1h-2zM4 12h4v1h-4zM9 12h4v1h-4zM16 12h1v1h-1zM20 12h1v1h-1zM23 12h1v1h-1zM25 12h2v1h-2zM0 13h2v1h-2zM8 13h2v1h-2zM11 13h3v1h-3zM19 13h1v1h-1zM21 13h2v1h-2zM26 13h3v1h-3zM0 14h1v1h-1zM3 14h1v1h-1zM5 14h3v1h-3zM12 14h1v1h-1zM14 14h1v1h-1zM17 14h4v1h-4zM22 14h3v1h-3zM26 14h3v1h-3zM0 15h1v1h-1zM4 15h1v1h-1zM7 15h1v1h-1zM9 15h2v1h-2zM12 15h2v1h-2zM15 15h1v1h-1zM18 15h1v1h-1zM20 15h2v1h-2zM23 15h1v1h-1zM27 15h1v1h-1zM1 16h4v1h-4zM6 16h6v1h-6zM19 16h2v1h-2zM23 16h3v1h-3zM27 16h1v1h-1zM1 17h3v1h-3zM10 17h1v1h-1zM13 17h1v1h-1zM17 17h2v1h-2zM20 17h1v1h-1zM23 17h1v1h-1zM25 17h3v1h-3zM0 18h1v1h-1zM4 18h1v1h-1zM6 18h1v1h-1zM10 18h3v1h-3zM18 18h1v1h-1zM20 18h1v1h-1zM22 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM2 19h1v1h-1zM4 19h1v1h-1zM7 19h2v1h-2zM15 19h3v1h-3zM20 19h1v1h-1zM22 19h3v1h-3zM26 19h1v1h-1zM1 20h1v1h-1zM3 20h4v1h-4zM8 20h1v1h-1zM11 20h1v1h-1zM13 20h1v1h-1zM15 20h2v1h-2zM18 20h9v1h-9zM8 21h4v1h-4zM13 21h3v1h-3zM20 21h1v1h-1zM24 21h5v1h-5zM0 22h7v1h-7zM8 22h2v1h-2zM11 22h3v1h-3zM16 22h1v1h-1zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h2v1h-2zM27 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM10 23h3v1h-3zM16 23h1v1h-1zM20 23h1v1h-1zM24 23h2v1h-2zM27 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM9 24h2v1h-2zM14 24h5v1h-5zM20 24h5v1h-5zM26 24h1v1h-1zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h2v1h-2zM11 25h1v1h-1zM13 25h2v1h-2zM16 25h3v1h-3zM20 25h2v1h-2zM23 25h3v1h-3zM27 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h1v1h-1zM12 26h1v1h-1zM16 26h2v1h-2zM19 26h2v1h-2zM23 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM10 27h1v1h-1zM14 27h1v1h-1zM16 27h1v1h-1zM18 27h3v1h-3zM23 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM0 28h7v1h-7zM8 28h1v1h-1zM12 28h3v1h-3zM16 28h6v1h-6zM23 28h1v1h-1zM25 28h1v1h-1zM27 28h1v1h-1z" />
                </svg>
) : v.guestUrl ? <InviteQr url={v.guestUrl} /> : null}
              </section>
              {v.isPrototype ? <p className="f-wait s-body">The best time shows up once people respond.</p> : null}
            </>
          ) : null}
          {v.showResults ? (
            <>
              <section className="ev-best s-body" aria-labelledby="best-label">
                {v.hasBest ? (
                  <>
                    <p id="best-label" className="label-red">Best so far</p>
                    <p className="rec-time">
                      <span>{v.bestDay}</span>
                      <span className="comma">,{' '}</span>
                      <span className="t2">{v.bestTime}</span>
                    </p>
                    <p className="rec-date">{v.bestDate}</p>
                    <p className="comp-h rec-viable">{v.bestLine}</p>
                  </>
                ) : null}
                {v.noBest ? (
                  <>
                    <p id="best-label" className="f-wait">The best time shows up once people respond.</p>
                  </>
                ) : null}
              </section>
              <section className="ev-dots s-body" aria-label="Days compared">
                <DotRows v={v} />
              </section>
              <section className="ev-people s-body" aria-labelledby="people-h">
                <h2 id="people-h" className="comp-h">Responses</h2>
                <div className="avatars">
                  {(v.people || []).map((p: any, $index: number) => (
                    <Fragment key={$index}>
                      <button type="button" className={p.cls} aria-label={p.name} aria-pressed={p.pressed} onClick={p.toggle}>
                        <span aria-hidden="true">{p.initial}</span>
                        <span className="av-tip" aria-hidden="true">{p.name}</span>
                      </button>
                    </Fragment>
                  ))}
                </div>
              </section>
            </>
          ) : null}
          {v.showOrgSide ? (
            <>
              <aside className={"ev-side s-body" + (v.isPersisted ? " is-live" : "")} aria-label="Organiser tools">
                {v.isPrototype ? (
                <section className="glass e-share" aria-label="Event link">
                  <div className="share-text">
                    <p className="share-link" title={v.shareLinkTitle} ref={v.setLinkEl}>{v.shareLinkText}</p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={v.copyLink}>Copy link</button>
                    <p className="small copy-msg" role="status" aria-live="polite">{v.linkMsg}</p>
                  </div>
                  {v.isPrototype ? (
<svg className="qr" viewBox="-2 -2 33 33" role="img" aria-label="QR code for the event link" shapeRendering="crispEdges">
                    <rect x="-2" y="-2" width="33" height="33" fill="#FFFFFF" />
                    <path fill="#333333" d="M0 0h7v1h-7zM8 0h1v1h-1zM10 0h3v1h-3zM15 0h5v1h-5zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h3v1h-3zM12 1h1v1h-1zM14 1h2v1h-2zM18 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM10 2h1v1h-1zM12 2h4v1h-4zM18 2h3v1h-3zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h2v1h-2zM11 3h1v1h-1zM16 3h2v1h-2zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM10 4h1v1h-1zM13 4h1v1h-1zM17 4h1v1h-1zM19 4h1v1h-1zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM9 5h4v1h-4zM14 5h1v1h-1zM18 5h2v1h-2zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM8 7h1v1h-1zM10 7h5v1h-5zM17 7h2v1h-2zM0 8h1v1h-1zM2 8h2v1h-2zM5 8h3v1h-3zM12 8h3v1h-3zM16 8h2v1h-2zM22 8h1v1h-1zM25 8h1v1h-1zM27 8h2v1h-2zM0 9h1v1h-1zM3 9h1v1h-1zM7 9h2v1h-2zM10 9h2v1h-2zM15 9h6v1h-6zM22 9h3v1h-3zM28 9h1v1h-1zM0 10h3v1h-3zM4 10h4v1h-4zM9 10h1v1h-1zM14 10h2v1h-2zM18 10h1v1h-1zM20 10h2v1h-2zM24 10h1v1h-1zM26 10h2v1h-2zM0 11h5v1h-5zM9 11h2v1h-2zM13 11h3v1h-3zM18 11h2v1h-2zM21 11h3v1h-3zM28 11h1v1h-1zM1 12h2v1h-2zM4 12h4v1h-4zM9 12h4v1h-4zM16 12h1v1h-1zM20 12h1v1h-1zM23 12h1v1h-1zM25 12h2v1h-2zM0 13h2v1h-2zM8 13h2v1h-2zM11 13h3v1h-3zM19 13h1v1h-1zM21 13h2v1h-2zM26 13h3v1h-3zM0 14h1v1h-1zM3 14h1v1h-1zM5 14h3v1h-3zM12 14h1v1h-1zM14 14h1v1h-1zM17 14h4v1h-4zM22 14h3v1h-3zM26 14h3v1h-3zM0 15h1v1h-1zM4 15h1v1h-1zM7 15h1v1h-1zM9 15h2v1h-2zM12 15h2v1h-2zM15 15h1v1h-1zM18 15h1v1h-1zM20 15h2v1h-2zM23 15h1v1h-1zM27 15h1v1h-1zM1 16h4v1h-4zM6 16h6v1h-6zM19 16h2v1h-2zM23 16h3v1h-3zM27 16h1v1h-1zM1 17h3v1h-3zM10 17h1v1h-1zM13 17h1v1h-1zM17 17h2v1h-2zM20 17h1v1h-1zM23 17h1v1h-1zM25 17h3v1h-3zM0 18h1v1h-1zM4 18h1v1h-1zM6 18h1v1h-1zM10 18h3v1h-3zM18 18h1v1h-1zM20 18h1v1h-1zM22 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM2 19h1v1h-1zM4 19h1v1h-1zM7 19h2v1h-2zM15 19h3v1h-3zM20 19h1v1h-1zM22 19h3v1h-3zM26 19h1v1h-1zM1 20h1v1h-1zM3 20h4v1h-4zM8 20h1v1h-1zM11 20h1v1h-1zM13 20h1v1h-1zM15 20h2v1h-2zM18 20h9v1h-9zM8 21h4v1h-4zM13 21h3v1h-3zM20 21h1v1h-1zM24 21h5v1h-5zM0 22h7v1h-7zM8 22h2v1h-2zM11 22h3v1h-3zM16 22h1v1h-1zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h2v1h-2zM27 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h1v1h-1zM10 23h3v1h-3zM16 23h1v1h-1zM20 23h1v1h-1zM24 23h2v1h-2zM27 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM9 24h2v1h-2zM14 24h5v1h-5zM20 24h5v1h-5zM26 24h1v1h-1zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h2v1h-2zM11 25h1v1h-1zM13 25h2v1h-2zM16 25h3v1h-3zM20 25h2v1h-2zM23 25h3v1h-3zM27 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h1v1h-1zM12 26h1v1h-1zM16 26h2v1h-2zM19 26h2v1h-2zM23 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM10 27h1v1h-1zM14 27h1v1h-1zM16 27h1v1h-1zM18 27h3v1h-3zM23 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM0 28h7v1h-7zM8 28h1v1h-1zM12 28h3v1h-3zM16 28h6v1h-6zM23 28h1v1h-1zM25 28h1v1h-1zM27 28h1v1h-1z" />
                  </svg>
) : null}
                </section>
                ) : null}
                <section className={"ev-actions" + (v.isPersisted ? " is-live" : "")} aria-label="Organiser actions">
                  <div className="btn-row">
                    {v.isPrototype ? <button type="button" className="btn btn-primary" onClick={v.openPropose}>{v.proposeLabel}</button> : null}
                    {v.roundCanPropose ? <button type="button" className="btn btn-primary" onClick={v.openRoundSheet}>{v.roundProposeLabel}</button> : null}
                    <button type="button" className="btn btn-secondary" onClick={v.toggleReminder} aria-expanded={v.reminderExpanded}>Draft reminder</button>
                  </div>
                  <RoundCard v={v} side />
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
            </>
          ) : null}
          {v.showEditLink ? (
            <p className="small s-body">
              Editing on another device?{' '}
              <button type="button" className="text-btn text-btn-muted" onClick={v.copyEditLink}>Copy your edit link</button>.
              {' '}<span role="status" aria-live="polite">{v.editLinkMsg}</span>
            </p>
          ) : null}
          {v.showInviteBottom ? (
            <section className="glass f-invite ev-invite-bottom s-body" aria-label="Invite link">
              <div className="f-invite-text">
                <p className="f-link" ref={v.setLinkEl}>{v.shareLinkText}</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={v.copyLink}>Copy link</button>
                  <p className="small copy-msg" role="status" aria-live="polite">{v.linkMsg}</p>
                </div>
              </div>
              {v.guestUrl ? <InviteQr url={v.guestUrl} /> : null}
            </section>
          ) : null}
          <nav className="ev-links s-body" aria-label="More">
            {v.isPrototype || v.isGuestView ? <button type="button" className="text-btn" onClick={v.editMyResponse}>Edit my response</button> : null}
            {v.isGuestView && v.canSwitchGuest ? <button type="button" className="text-btn text-btn-muted" onClick={v.switchGuest}>{v.switchLabel}</button> : null}
            {v.isOrgView && v.canEditEvent ? <button type="button" className="text-btn" onClick={v.startEditEvent}>Edit event</button> : null}
            {v.canCopyOrgLink ? <button type="button" className="text-btn" onClick={v.copyOrgLink}>Copy organiser link</button> : null}
            {v.isOrgView ? (
              <>
                <button type="button" className="text-btn" onClick={v.goHome}>Plan something else</button>
                {v.isPrototype ? <button type="button" className="text-btn" onClick={v.previewGuest}>Preview as a guest</button> : null}
                {/* Plain <a>, not next/link: a full page load keeps Main's and Event's CSS apart. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                {v.isPrototype ? <a className="text-btn" href="/example" onClick={v.saveForReturn}>Preview with sample responses</a> : null}
              </>
            ) : null}
            {v.isGuestView ? (
              <>
                <button type="button" className="text-btn" onClick={v.goHome}>Plan your own</button>
                {v.showLeaveEvent ? <button type="button" className="text-btn text-btn-muted" onClick={v.openEventClose}>Leave event</button> : null}
              </>
            ) : null}
          </nav>
        </div>
      </main>
    </>
  );
}
