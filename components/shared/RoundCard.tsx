// Propose-a-time card for stored events. Every guest gets the same card; only their own answer is ever shown.
// `side` is the organiser's copy in the right-hand column; the other copy is the guest card in the main column.
export default function RoundCard({ v, side = false }: { v: any; side?: boolean }) {
  if (!v.roundOn || side !== !!v.isOrgView) return null;
  return (
    <section className="glass round s-body" aria-label="Proposed time" aria-live="polite">
      {v.roundHasTally ? (
        <>
          <p className="round-tally" role="status">
            {v.roundTallyLine}
          </p>
          <ul className="round-people" aria-label="Replies">
            {v.roundTally.map((t: any) => (
              <li key={t.name} className={t.cls}>
                <span className="round-chip-name">{t.name}</span>
                <span className="round-chip-state">{t.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {v.roundConfirmed ? (
        <>
          <p className="label-red">Time confirmed</p>
          <p className="round-when">{v.roundWhen}</p>
          {v.roundConfirmedGoing ? <p className="round-note">It's on. {v.roundConfirmedCount}</p> : null}
          {v.roundConfirmedNot ? <p className="round-note">The event is going ahead without you. {v.roundConfirmedCount}</p> : null}
        </>
      ) : null}
      {v.roundFailedGuest ? <p className="round-note">The proposed time didn't go ahead. The organiser may suggest another.</p> : null}
      {v.roundOrgFailed ? (
        <p className="round-note">Not enough people said yes to go ahead (needed {v.roundMin}). You can propose again.</p>
      ) : null}
      {v.roundOrgOpen ? (
        <>
          <p className="label-red">Waiting for replies</p>
          <p className="round-when">{v.roundWhen}</p>
          <p className="round-note">
            {v.roundBy}. Goes ahead if at least {v.roundMin} people, including you, are in.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={v.askClosePoll}>
              Close poll now
            </button>
          </div>
        </>
      ) : null}
      {v.roundGuestAsk || v.roundGuestVoted ? (
        <>
          <p className="label-red">Are you in?</p>
          <p className="round-when">{v.roundWhen}</p>
          <p className="round-note">{v.roundBy}.</p>
        </>
      ) : null}
      {v.roundGuestAsk ? (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={v.voteIn} disabled={v.roundBusy}>
            I'm in
          </button>
          <button type="button" className="btn btn-secondary" onClick={v.voteOut} disabled={v.roundBusy}>
            Can't make it
          </button>
        </div>
      ) : null}
      {v.roundGuestVoted ? (
        <>
          <p className="round-note">{v.roundMyVote}</p>
          <button type="button" className="text-btn text-btn-muted round-change" onClick={v.changeVote}>
            Change my answer
          </button>
        </>
      ) : null}
      {v.roundCanWithdraw ? (
        <button type="button" className="text-btn text-btn-muted round-withdraw" onClick={v.askWithdraw}>
          Cancel this time
        </button>
      ) : null}
      {v.hasRoundError ? (
        <p className="form-error" role="alert">
          {v.roundError}
        </p>
      ) : null}
    </section>
  );
}
