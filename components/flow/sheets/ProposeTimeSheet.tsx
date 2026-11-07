// Organiser proposes the recommended time of a stored event: optional reply-by date and a minimum go-ahead number.
export default function ProposeTimeSheet({ v }: { v: any }) {
  return (
    <div className={v.roundOverlayCls} onKeyDown={v.roundSheetKey}>
      <button type="button" className="scrim" tabIndex={-1} aria-label="Close" onClick={v.closeRoundSheet} />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-labelledby="round-title" tabIndex={-1} ref={v.setRoundSheetEl}>
        <div className="sheet-intro">
          <h2 id="round-title" className="section-h">
            Propose a start time
          </h2>
          <p>This is when the event starts. Everyone who has joined will be asked if they're in. They can't see each other's answers.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="r-time">
            Start time
          </label>
          <select id="r-time" className="select" value={v.roundSlot} onChange={v.setRoundSlot}>
            {(v.roundSlotOptions || []).map((o: any) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="r-deadline">
            Reply by (optional)
          </label>
          <input
            id="r-deadline"
            className="input-line"
            type="date"
            min={v.roundDeadlineMin}
            max={v.roundSlot}
            value={v.roundDeadline}
            onChange={v.setRoundDeadline}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="r-min">
            Minimum to go ahead
          </label>
          <div className="inline-field">
            <span>Go ahead if at least</span>
            <input
              id="r-min"
              className="num"
              type="number"
              min="2"
              max="200"
              inputMode="numeric"
              value={v.roundMinInput}
              onChange={v.setRoundMin}
            />
            <span>people are in, including you.</span>
          </div>
        </div>
        {v.hasRoundError ? (
          <p className="form-error" role="alert">
            {v.roundError}
          </p>
        ) : null}
        <div className="sheet-actions">
          <button type="button" className="text-btn text-btn-muted" onClick={v.closeRoundSheet} disabled={v.roundBusy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={v.submitRound} disabled={v.roundBusy}>
            {v.roundBusy ? 'Proposing…' : 'Propose'}
          </button>
        </div>
      </div>
    </div>
  );
}
