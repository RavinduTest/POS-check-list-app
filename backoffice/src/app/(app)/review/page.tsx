"use client";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useRecords } from "@/lib/data";
import { fmtDate } from "@/lib/util";

export default function Review() {
  const { records, loading } = useRecords("submitted");
  return (<>
    <h1>Pending Review</h1>
    {loading ? <p className="muted">Loading…</p> : <div className="tablewrap"><table>
      <thead><tr><th>Submitted</th><th>Record</th><th>Company</th><th>Branch</th><th>Terminal</th><th>Technician</th><th>Status</th></tr></thead>
      <tbody>{records.map((r) => <tr key={r.id}><td>{fmtDate(r.submittedAt)}</td><td><Link href={`/records/${r.id}`}>{r.recordNo}</Link></td><td>{r.company}</td><td>{r.branch}</td><td>{r.terminalId}</td><td>{r.technicianName}</td><td><StatusBadge status={r.status} /></td></tr>)}
        {records.length === 0 && <tr><td colSpan={7} className="muted">Nothing waiting for review 🎉</td></tr>}</tbody></table></div>}
  </>);
}
