"use client";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth";
import { useTemplateVersion } from "@/lib/data";
import { db } from "@/lib/firebase";
import { Answer, Field, InstallRecord } from "@/lib/types";
import { answerText, fmtDate, sortedSections } from "@/lib/util";

interface Hist { id: string; action: string; byName: string; at?: { toDate(): Date }; comment?: string; changes?: { fieldKey: string; old: unknown; new: unknown }[] }
const STATUSES = [["", "—"], ["done", "Done"], ["not_done", "Not done"], ["na", "N/A"]];

export default function RecordDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, role, name } = useAuth();
  const [rec, setRec] = useState<InstallRecord | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, Answer>>({});
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState("");
  const [fc, setFc] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const tpl = useTemplateVersion(rec?.templateVersion);

  useEffect(() => onSnapshot(doc(db, "records", id), (s) => setRec(s.exists() ? ({ id: s.id, ...s.data() } as InstallRecord) : null)), [id]);
  useEffect(() => onSnapshot(query(collection(db, "records", id, "history"), orderBy("at", "asc")), (s) => setHist(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Hist)), () => undefined), [id]);
  const sections = useMemo(() => sortedSections(tpl), [tpl]);

  if (!rec) return <p className="muted">Loading…</p>;
  const canEdit = role === "admin" || (role === "supervisor" && ["submitted", "returned"].includes(rec.status));
  const canReview = (role === "admin" || role === "supervisor") && rec.status === "submitted";
  const who = { updatedBy: user!.uid, updatedByName: name, updatedAt: serverTimestamp() };
  const run = async (fn: () => Promise<void>) => { setErr(""); try { await fn(); } catch (e) { setErr((e as Error).message); } };

  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(rec.answers ?? {}))); setEdit(true); };
  const setA = (k: string, p: Partial<Answer>) => setDraft((d) => ({ ...d, [k]: { ...d[k], ...p } }));
  const save = () => run(async () => {
    const top: Record<string, unknown> = {};
    for (const s of sections) for (const f of s.fields) if (f.role) {
      const v = draft[f.key]?.value; const map: Record<string, string> = { company: "company", branch: "branch", terminalId: "terminalId", anydeskNo: "anydeskNo", installDate: "installDate" };
      if (map[f.role]) top[map[f.role]] = v == null ? "" : String(v);
    }
    await updateDoc(doc(db, "records", id), { answers: draft, ...top, ...who }); setEdit(false);
  });
  const approve = () => run(() => updateDoc(doc(db, "records", id), { status: "approved", reviewedBy: user!.uid, reviewedAt: serverTimestamp(), reviewComment: "", ...who }));
  const doReturn = () => {
    if (!comment.trim()) return setErr("A comment is required to return a record");
    return run(async () => {
      const fieldComments = Object.fromEntries(Object.entries(fc).filter(([, v]) => v.trim()));
      await updateDoc(doc(db, "records", id), { status: "returned", reviewComment: comment, fieldComments, reviewedBy: user!.uid, reviewedAt: serverTimestamp(), ...who });
      setReturning(false);
    });
  };
  const softDelete = () => confirm("Delete this record? It can be restored for 30 days.") && run(() => updateDoc(doc(db, "records", id), { deleted: true, deletedAt: serverTimestamp(), ...who }));

  const renderEditor = (f: Field) => {
    const a = draft[f.key] ?? {};
    return (<div className="row" style={{ margin: 0 }}>
      {f.type === "checklist" && <select value={a.status ?? ""} onChange={(e) => setA(f.key, { status: (e.target.value || undefined) as Answer["status"] })}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
      {f.type === "checklist" && f.options.length > 0 && <select value={String(a.value ?? "")} onChange={(e) => setA(f.key, { value: e.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>}
      {!["checklist", "photo", "signature", "toggle", "multiselect"].includes(f.type) && <input max={f.type === "date" ? new Date().toISOString().slice(0, 10) : undefined} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"} value={String(a.value ?? "")} onChange={(e) => setA(f.key, { value: e.target.value })} />}
      {f.type === "dropdown" && <select value={String(a.value ?? "")} onChange={(e) => setA(f.key, { value: e.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>}
      {f.type === "toggle" && <select value={String(a.value ?? "")} onChange={(e) => setA(f.key, { value: e.target.value === "" ? null : e.target.value === "true" })}><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select>}
      <input placeholder="Note" value={a.note ?? ""} onChange={(e) => setA(f.key, { note: e.target.value })} />
    </div>);
  };

  return (<>
    <div className="row noprint"><h1 style={{ margin: 0 }}>{rec.recordNo ?? "Draft record"}</h1><StatusBadge status={rec.status} /><span className="muted">template v{rec.templateVersion} · {rec.completionPct ?? 0}% complete</span>
      <span style={{ flex: 1 }} />
      <button onClick={() => window.print()}>Print / PDF</button>
      {canEdit && !edit && <button onClick={startEdit}>Edit</button>}
      {edit && <><button className="primary" onClick={save}>Save changes</button><button onClick={() => setEdit(false)}>Cancel</button></>}
      {canReview && <><button className="primary" onClick={approve}>Approve</button><button className="danger" onClick={() => setReturning(!returning)}>{returning ? "Cancel return" : "Return for correction"}</button></>}
      {role === "admin" && <button className="danger" onClick={softDelete}>Delete</button>}
    </div>
    {err && <p className="err" role="alert">{err}</p>}
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="grid2">
        <div><b>Company:</b> {rec.company}</div><div><b>Branch:</b> {rec.branch}</div>
        <div><b>Terminal ID:</b> {rec.terminalId}</div><div><b>AnyDesk:</b> {rec.anydeskNo}</div>
        <div><b>Technician:</b> {rec.technicianName}</div><div><b>Install date:</b> {rec.installDate}</div>
        <div><b>Started:</b> {fmtDate(rec.startedAt)}</div><div><b>Submitted:</b> {fmtDate(rec.submittedAt)}</div>
        {rec.location && <div><b>GPS:</b> <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${rec.location.lat}&mlon=${rec.location.lng}#map=17/${rec.location.lat}/${rec.location.lng}`}>{rec.location.lat.toFixed(5)}, {rec.location.lng.toFixed(5)} (map)</a></div>}
      </div>
      {rec.reviewComment && <p className="err"><b>Reviewer comment:</b> {rec.reviewComment}</p>}
      {rec.remark && <p><b>Remark:</b> {rec.remark}</p>}
      <div className="signoff"><b>Customer sign-off:</b><br />
        {rec.signatureUrl
          ? <img src={rec.signatureUrl} alt="Customer signature" style={{ height: 90, background: "#fff", border: "1px solid var(--border)", borderRadius: 6, cursor: "zoom-in" }} onClick={() => setLightbox(rec.signatureUrl!)} />
          : <span className="muted">Not provided</span>}</div>
    </div>
    {returning && <div className="card noprint" style={{ marginBottom: 16 }}><b>Return comment (required)</b>
      <textarea style={{ width: "100%" }} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      <p className="muted">Optionally add a comment to specific fields below.</p><button className="danger" onClick={doReturn}>Send back to technician</button></div>}
    {!tpl && <p className="muted">Loading template…</p>}
    {sections.filter((s) => !s.hidden || s.fields.some((f) => rec.answers?.[f.key])).map((s) => (
      <div key={s.id} className="card" style={{ marginBottom: 12 }}><h2>{s.name}</h2>
        {s.fields.map((f) => { const a = (edit ? draft : rec.answers ?? {})[f.key]; const flagged = rec.fieldComments?.[f.key];
          const g = s.groups.find((x) => x.id === f.groupId);
          return (<div key={f.key} className={`item ${flagged ? "flag" : ""}`}>
            <div className="row" style={{ margin: 0, justifyContent: "space-between" }}><b>{g ? `${g.name} · ` : ""}{f.label}{f.required ? " *" : ""}</b>{!edit && <span>{answerText(f, a)}</span>}</div>
            {edit && renderEditor(f)}
            {!edit && a?.note && <div className="muted">Note: {a.note}</div>}
            {flagged && <div className="err">Reviewer: {flagged}</div>}
            {a?.photoUrls && a.photoUrls.length > 0 && <div className="photos" style={{ marginTop: 6 }}>{a.photoUrls.map((u) => <img key={u} src={u} alt={f.label} onClick={() => setLightbox(u)} />)}</div>}
            {returning && <input style={{ width: "100%", marginTop: 6 }} placeholder="Comment for this field (optional)" value={fc[f.key] ?? ""} onChange={(e) => setFc({ ...fc, [f.key]: e.target.value })} />}
          </div>); })}
      </div>))}
    <h2>History</h2>
    <div className="card">{hist.map((h) => <div key={h.id} style={{ marginBottom: 6 }}><b>{h.action}</b> by {h.byName || "system"} · <span className="muted">{fmtDate(h.at)}</span>{h.comment ? ` — ${h.comment}` : ""}
      {h.changes?.map((c) => <div key={c.fieldKey} className="muted" style={{ marginLeft: 16 }}>{c.fieldKey}: {JSON.stringify(c.old)} → {JSON.stringify(c.new)}</div>)}</div>)}
      {hist.length === 0 && <span className="muted">No history</span>}</div>
    {lightbox && <div className="modal" onClick={() => setLightbox(null)}><img src={lightbox} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh" }} /></div>}
  </>);
}
