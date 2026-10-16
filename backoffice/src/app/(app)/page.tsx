"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useRecords } from "@/lib/data";

type Period = "today" | "week" | "month" | "all";
const since = (p: Period) => { const d = new Date(); d.setHours(0, 0, 0, 0); if (p === "week") d.setDate(d.getDate() - 7); if (p === "month") d.setDate(1); return p === "all" ? 0 : d.getTime(); };

export default function Dashboard() {
  const { records, loading } = useRecords();
  const [period, setPeriod] = useState<Period>("month");
  const inP = useMemo(() => records.filter((r) => (r.createdAt?.toDate().getTime() ?? 0) >= since(period)), [records, period]);
  const count = (s: string) => inP.filter((r) => r.status === s).length;
  const board = useMemo(() => {
    const m = new Map<string, number>(); inP.filter((r) => r.status !== "draft").forEach((r) => m.set(r.technicianName, (m.get(r.technicianName) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [inP]);
  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    inP.filter((r) => r.status !== "draft").forEach((r) => { const k = r.createdAt?.toDate().toISOString().slice(0, 10) ?? ""; m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m].sort().slice(-14);
  }, [inP]);
  const max = Math.max(1, ...perDay.map((d) => d[1]));
  const recent = records.filter((r) => r.status !== "draft").sort((a, b) => (b.submittedAt?.toDate().getTime() ?? 0) - (a.submittedAt?.toDate().getTime() ?? 0)).slice(0, 10);

  return (<>
    <h1>Dashboard</h1>
    <div className="row"><select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Period">
      <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="all">All time</option></select></div>
    {loading ? <p className="muted">Loading…</p> : <>
      <div className="cards">
        <div className="card"><div className="n">{inP.filter((r) => r.status !== "draft").length}</div><div className="t">Total installations</div></div>
        <div className="card"><div className="n">{count("submitted")}</div><div className="t">Pending review</div></div>
        <div className="card"><div className="n">{count("returned")}</div><div className="t">Returned</div></div>
        <div className="card"><div className="n">{count("approved")}</div><div className="t">Approved</div></div>
      </div>
      <div className="grid2">
        <div className="card"><h2>Installations per day</h2>
          {perDay.length === 0 ? <p className="muted">No data</p> : <svg viewBox={`0 0 ${perDay.length * 40} 120`} width="100%" role="img" aria-label="Installations per day">
            {perDay.map(([d, n], i) => <g key={d}><rect x={i * 40 + 6} y={100 - (n / max) * 90} width="28" height={(n / max) * 90} fill="var(--primary)" rx="3" />
              <text x={i * 40 + 20} y={96 - (n / max) * 90} fontSize="10" textAnchor="middle" fill="currentColor">{n}</text>
              <text x={i * 40 + 20} y="114" fontSize="9" textAnchor="middle" fill="currentColor">{d.slice(5)}</text></g>)}
          </svg>}</div>
        <div className="card"><h2>Technician leaderboard</h2>
          {board.length === 0 ? <p className="muted">No data</p> : <ol>{board.map(([n, c]) => <li key={n}>{n} — <b>{c}</b></li>)}</ol>}</div>
      </div>
      <h2 style={{ marginTop: 20 }}>Recent submissions</h2>
      <div className="tablewrap"><table><tbody>{recent.map((r) => (
        <tr key={r.id}><td><Link href={`/records/${r.id}`}>{r.recordNo ?? r.id.slice(0, 6)}</Link></td><td>{r.company}</td><td>{r.branch}</td><td>{r.technicianName}</td><td><StatusBadge status={r.status} /></td></tr>))}
        {recent.length === 0 && <tr><td className="muted">No submissions yet</td></tr>}</tbody></table></div>
    </>}
  </>);
}
