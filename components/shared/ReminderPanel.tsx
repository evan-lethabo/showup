// Shared markup, identical in Main.dc.html and Event.dc.html (or used twice in Main): the "Draft reminder" panel.

export default function ReminderPanel({ v }: { v: any }) {
  return (
    <div className="reminder glass">
      <label className="field-label" htmlFor="reminder-text">
        Reminder message
      </label>
      <textarea
        id="reminder-text"
        className="input"
        rows={3}
        readOnly
        value={v.reminderText}
        onChange={v.noop}
        onFocus={v.selectAll}
        ref={v.setRemEl}
      />
      <p className="small">Nothing is sent automatically. Paste it wherever your group chats.</p>
      <div className="btn-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={v.copyReminder}>
          Copy reminder
        </button>
        <button type="button" className="text-btn" onClick={v.toggleReminder}>
          Done
        </button>
      </div>
      <p className="small copy-msg" role="status" aria-live="polite">
        {v.remMsg}
      </p>
    </div>
  );
}
