// Shared markup, identical in Main.dc.html and Event.dc.html (or used twice in Main): the "Proposal saved" notice.

export default function ProposalNotice({ v }: { v: any }) {
  return (
    <div className="proposal" role="status">
      <p className="label-red">Proposal saved in this prototype</p>
      <p>{v.proposalText}</p>
      <p className="small">Nothing has been sent. Collecting final commitments is designed in the next phase.</p>
      <div className="btn-row">
        <button type="button" className="text-btn" onClick={v.openPropose}>
          Edit
        </button>
        <button type="button" className="text-btn" onClick={v.withdraw}>
          Withdraw
        </button>
      </div>
    </div>
  );
}
