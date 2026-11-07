export default function ConfirmSheet({ v }: { v: any }) {
  return (
    <div className={v.confirmOverlayCls} onKeyDown={v.confirmKey}>
      <button type="button" className="scrim" tabIndex={-1} aria-label="Close" onClick={v.closeConfirm} />
      <div
        className="sheet glass confirm-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        tabIndex={-1}
        ref={v.setConfirmEl}
      >
        <div className="sheet-intro">
          <h2 id="confirm-title" className="section-h">
            {v.confirmTitle}
          </h2>
          <p id="confirm-body">{v.confirmBody}</p>
        </div>
        {v.hasConfirmError ? (
          <p className="form-error" role="alert">
            {v.confirmError}
          </p>
        ) : null}
        <div className="sheet-actions">
          {v.confirmHasNo ? (
            <button type="button" className="text-btn text-btn-muted" onClick={v.closeConfirm} disabled={v.confirmBusy}>
              {v.confirmNo}
            </button>
          ) : null}
          <button
            type="button"
            className={'btn btn-primary' + (v.confirmDanger ? ' btn-danger' : '')}
            onClick={v.confirmAction}
            disabled={v.confirmBusy}
          >
            {v.confirmYes}
          </button>
        </div>
      </div>
    </div>
  );
}
