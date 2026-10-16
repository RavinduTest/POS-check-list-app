"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useRecords } from "@/lib/data";
import { InstallRecord } from "@/lib/types";
import { csvCell, download } from "@/lib/util";

const PAGE = 25;
type SortKey = "recordNo" | "company" | "branch" | "terminalId" | "technicianName" | "installDate" | "status" | "completionPct";

function RecordsInner() {
  const sp = useSearchParams();
  const { records, loading } = useRecords();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(""); const [tech, setTech] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [ver, setVer] = useState("");
  const [sort, setSort] = useState<SortKey>("installDate"); const [asc, setAsc] = useState(false); const [page, setPage] = useState(0);

  const techs = useMemo(() => [...new Set(records.map((r) => r.technicianName))].sort(), [records]);
  const vers = useMemo(() => [...new Set(records.map((r) => r.templateVersion))].sort((a, b) => a - b), [records]);
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    const f = records.filter((r) =>
      (!status || r.status === status) && (!tech || r.technicianName === tech) && (!ver || String(r.templateVersion) === ver) &&
      (!from || (r.installDate ?? "") >= from) && (!to || (r.installDate ?? "") <= to) &&
      (!t || [r.company, r.branch, r.terminalId, r.anydeskNo, r.recordNo].some((x) => String(x ?? "").toLowerCase().includes(t))));
    return f.sort((a, b) => { const x = a[sort] ?? "", y = b[sort] ?? ""; return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
  }, [records, q, status, tech, ver, from, to, sort, asc]);

  const th = (k: SortKey, l: string) => <th onClick={() => { setAsc(sort === k ? !asc : true); setSort(k); }}>{l}{sort === k ? (asc ? " ▲" : " ▼") : ""}</th>;
  const exportCsv = () => {
    const head = ["Record no", "Company", "Branch", "Terminal ID", "AnyDesk", "Technician", "Date", "Status", "Completion %", "Template"];
    const body = rows.map((r: InstallRecord) => [r.recordNo, r.company, r.branch, r.terminalId, r.anydeskNo, r.technicianName, r.installDate, r.status, r.completionPct, r.templateVersion].map(csvCell).join(","));
    download("records.csv", [head.map(csvCell).join(","), ...body].join("\n"));
  };

  return (<>
    <h1>Records</h1>
    <div className="row">
      <input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">Pending review</option><option value="returned">Returned</option><option value="approved">Approved</option></select>
      <select value={tech} onChange={(e) => setTech(e.target.value)} aria-label="Technician"><option value="">All technicians</option>{techs.map((t) => <option key={t}>{t}</option>)}</select>
      <select value={ver} onChange={(e) => setVer(e.target.value)} aria-label="Template version"><option value="">All versions</option>{vers.map((v) => <option key={v} value={v}>v{v}</option>)}</select>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      <button onClick={exportCsv}>Export CSV</button>
    </div>
    {loading ? <p className="muted">Loading…</p> : <>
      <div className="tablewrap"><table><thead><tr>{th("recordNo", "Record no.")}{th("company", "Company")}{th("branch", "Branch")}{th("terminalId", "Terminal")}{th("technicianName", "Technician")}{th("installDate", "Date")}{th("status", "Status")}{th("completionPct", "Completion")}</tr></thead>
        <tbody>{rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => (
          <tr key={r.id}><td><Link href={`/records/${r.id}`}>{r.recordNo ?? "(draft)"}</Link></td><td>{r.company}</td><td>{r.branch}</td><td>{r.terminalId}</td><td>{r.technicianName}</td><td>{r.installDate}</td><td><StatusBadge status={r.status} /></td><td>{r.completionPct ?? 0}%</td></tr>))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No records match.</td></tr>}</tbody></table></div>
      <div className="row" style={{ marginTop: 12 }}><button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE))} · {rows.length} records</span><button disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </>);
}
export default function Records() { return <Suspense fallback={<p className="muted">Loading…</p>}><RecordsInner /></Suspense>; }
