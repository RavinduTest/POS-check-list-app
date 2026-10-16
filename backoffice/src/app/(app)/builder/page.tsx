"use client";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRecords } from "@/lib/data";
import { db, functions } from "@/lib/firebase";
import { Field, FIELD_TYPES, Section } from "@/lib/types";
import { keyify } from "@/lib/util";

const move = <T,>(a: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= a.length) return a; const b = [...a]; [b[i], b[j]] = [b[j], b[i]]; return b; };
const reorder = <T extends { order: number }>(a: T[]) => a.map((x, i) => ({ ...x, order: i }));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function Builder() {
  const { user, role } = useAuth();
  const { records } = useRecords();
  const [secs, setSecs] = useState<Section[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selS, setSelS] = useState(0); const [selF, setSelF] = useState<string | null>(null);
  const [undo, setUndo] = useState<Section[][]>([]);
  const [msg, setMsg] = useState(""); const [summary, setSummary] = useState("");
  const dragKey = useRef<string | null>(null);

  useEffect(() => onSnapshot(doc(db, "templateDraft", "current"), (s) => { if (!loaded || !undo.length) setSecs((s.data()?.sections ?? []) as Section[]); setLoaded(true); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (role !== "admin") return <p>Admins only.</p>;

  const persist = (next: Section[]) => setDoc(doc(db, "templateDraft", "current"), { sections: next, updatedBy: user!.uid, updatedAt: serverTimestamp() });
  const mutate = (fn: (s: Section[]) => Section[]) => { setUndo((u) => [...u.slice(-19), clone(secs)]); const next = fn(clone(secs)); setSecs(next); void persist(next); };
  const doUndo = () => { const prev = undo[undo.length - 1]; if (!prev) return; setUndo(undo.slice(0, -1)); setSecs(prev); void persist(prev); };

  const sec = secs[selS] as Section | undefined;
  const field = sec?.fields.find((f) => f.key === selF);
  const usage = (key: string) => records.filter((r) => r.answers?.[key]).length;
  const allKeys = () => new Set(secs.flatMap((s) => s.fields.map((f) => f.key)));

  const addSection = () => mutate((s) => [...s, { id: `s${Date.now().toString(36)}`, name: "New section", description: "", icon: "list", order: s.length, hidden: false, groups: [], fields: [] }]);
  const delSection = () => { if (!sec) return; const n = sec.fields.reduce((a, f) => a + usage(f.key), 0); if (!confirm(`Delete section "${sec.name}"? ${n} past answers used its fields. Old versions keep it.`)) return;
    mutate((s) => reorder(s.filter((x) => x.id !== sec.id))); setSelS(0); setSelF(null); };
  const patchSec = (p: Partial<Section>) => mutate((s) => { s[selS] = { ...s[selS], ...p }; return s; });
  const addField = () => { const key0 = keyify("New field"); let key = key0, i = 2; const ks = allKeys(); while (ks.has(key)) key = `${key0}_${i++}`;
    const f: Field = { key, label: "New field", type: "text", required: false, options: [], validation: {}, helpText: "", placeholder: "", allowNote: false, allowPhoto: false, order: sec!.fields.length, groupId: null, hidden: false, defaultValue: null, visibleIf: null };
    mutate((s) => { s[selS].fields.push(f); return s; }); setSelF(key); };
  const patchField = (p: Partial<Field>) => mutate((s) => { const fs = s[selS].fields; const i = fs.findIndex((f) => f.key === selF); fs[i] = { ...fs[i], ...p }; return s; });
  const delField = () => { if (!field || !confirm(`Delete field "${field.label}"? ${usage(field.key)} past records have an answer for it. Old versions keep it.`)) return;
    mutate((s) => { s[selS].fields = reorder(s[selS].fields.filter((f) => f.key !== field.key)); return s; }); setSelF(null); };
  const moveToSection = (to: number) => { if (!field || to === selS) return; mutate((s) => { const f = { ...field, groupId: null }; s[selS].fields = reorder(s[selS].fields.filter((x) => x.key !== field.key)); s[to].fields = reorder([...s[to].fields, f]); return s; }); setSelS(to); };
  const dropOn = (targetKey: string) => { const k = dragKey.current; if (!k || k === targetKey) return; mutate((s) => { const fs = s[selS].fields; const a = fs.findIndex((f) => f.key === k), b = fs.findIndex((f) => f.key === targetKey); if (a < 0 || b < 0) return s; const [x] = fs.splice(a, 1); fs.splice(b, 0, x); s[selS].fields = reorder(fs); return s; }); };
  const publish = async () => { setMsg("Publishing…"); try { const r = await httpsCallable<unknown, { versionNo: number }>(functions, "publishTemplate")({ changeSummary: summary }); setMsg(`Published v${r.data.versionNo}`); setSummary(""); } catch (e) { setMsg((e as Error).message); } };

  return (<>
    <div className="row"><h1 style={{ margin: 0, flex: 1 }}>Checklist Builder</h1>
      <button onClick={doUndo} disabled={!undo.length}>Undo</button>
      <input placeholder="Change summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
      <button className="primary" onClick={publish}>Publish new version</button></div>
    {msg && <p role="status">{msg}</p>}
    <p className="muted">Edits save to the draft automatically. Publishing creates a new immutable version that the mobile app uses for new records. Drag fields to reorder.</p>
    <div className="split"><div>
      <div className="row">{[...secs].map((s, i) => <button key={s.id} className={i === selS ? "primary" : ""} onClick={() => { setSelS(i); setSelF(null); }}>{s.hidden ? "🙈 " : ""}{s.name}</button>)}<button onClick={addSection}>＋ Section</button></div>
      {sec && <div className="card" style={{ marginBottom: 12 }}>
        <div className="grid2">
          <label>Name<input style={{ width: "100%" }} value={sec.name} onChange={(e) => patchSec({ name: e.target.value })} /></label>
          <label>Icon<input style={{ width: "100%" }} value={sec.icon} onChange={(e) => patchSec({ icon: e.target.value })} /></label></div>
        <label>Description<input style={{ width: "100%" }} value={sec.description} onChange={(e) => patchSec({ description: e.target.value })} /></label>
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => { mutate((s) => reorder(move(s, selS, -1))); setSelS(Math.max(0, selS - 1)); }}>↑ Move up</button>
          <button onClick={() => { mutate((s) => reorder(move(s, selS, 1))); setSelS(Math.min(secs.length - 1, selS + 1)); }}>↓ Move down</button>
          <button onClick={() => patchSec({ hidden: !sec.hidden })}>{sec.hidden ? "Show" : "Hide"}</button>
          <button className="danger" onClick={delSection}>Delete section</button></div>
        <div className="row"><b>Groups:</b>{sec.groups.map((g) => <span key={g.id} className="badge">{g.name} <a href="#" onClick={(e) => { e.preventDefault(); patchSec({ groups: sec.groups.filter((x) => x.id !== g.id) }); }}>×</a></span>)}
          <button onClick={() => { const n = prompt("Group name"); if (n) patchSec({ groups: [...sec.groups, { id: `g${Date.now().toString(36)}`, name: n }] }); }}>＋ Group</button></div></div>}
      {sec?.fields.map((f, i) => <div key={f.key} className={`item ${f.key === selF ? "flag" : ""}`} draggable onDragStart={() => (dragKey.current = f.key)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(f.key)} onClick={() => setSelF(f.key)} style={{ cursor: "grab", opacity: f.hidden ? 0.5 : 1 }}>
        <div className="row" style={{ margin: 0 }}><b style={{ flex: 1 }}>{f.label}{f.required ? " *" : ""}</b><span className="muted">{f.type}{f.groupId ? ` · ${sec.groups.find((g) => g.id === f.groupId)?.name}` : ""}</span>
          <button onClick={(e) => { e.stopPropagation(); mutate((s) => { s[selS].fields = reorder(move(s[selS].fields, i, -1)); return s; }); }}>↑</button>
          <button onClick={(e) => { e.stopPropagation(); mutate((s) => { s[selS].fields = reorder(move(s[selS].fields, i, 1)); return s; }); }}>↓</button></div></div>)}
      {sec && <button onClick={addField}>＋ Field</button>}
      {field && sec && <div className="card" style={{ marginTop: 12 }}><h2>Field: {field.key}</h2>
        <div className="grid2">
          <label>Label<input style={{ width: "100%" }} value={field.label} onChange={(e) => patchField({ label: e.target.value })} /></label>
          <label>Type<select style={{ width: "100%" }} value={field.type} onChange={(e) => patchField({ type: e.target.value as Field["type"] })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Help text<input style={{ width: "100%" }} value={field.helpText} onChange={(e) => patchField({ helpText: e.target.value })} /></label>
          <label>Placeholder<input style={{ width: "100%" }} value={field.placeholder} onChange={(e) => patchField({ placeholder: e.target.value })} /></label>
          <label>Default value<input style={{ width: "100%" }} value={String(field.defaultValue ?? "")} onChange={(e) => patchField({ defaultValue: e.target.value || null })} /></label>
          <label>Group<select style={{ width: "100%" }} value={field.groupId ?? ""} onChange={(e) => patchField({ groupId: e.target.value || null })}><option value="">(none)</option>{sec.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label>Options (comma separated)<input style={{ width: "100%" }} value={field.options.join(", ")} onChange={(e) => patchField({ options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></label>
          <label>Move to section<select style={{ width: "100%" }} value={selS} onChange={(e) => moveToSection(Number(e.target.value))}>{secs.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}</select></label>
          <label>Min length / value<input type="number" style={{ width: "100%" }} value={field.validation.minLength ?? field.validation.min ?? ""} onChange={(e) => patchField({ validation: { ...field.validation, ...(field.type === "number" ? { min: e.target.value === "" ? undefined : Number(e.target.value) } : { minLength: e.target.value === "" ? undefined : Number(e.target.value) }) } })} /></label>
          <label>Max length / value<input type="number" style={{ width: "100%" }} value={field.validation.maxLength ?? field.validation.max ?? ""} onChange={(e) => patchField({ validation: { ...field.validation, ...(field.type === "number" ? { max: e.target.value === "" ? undefined : Number(e.target.value) } : { maxLength: e.target.value === "" ? undefined : Number(e.target.value) }) } })} /></label>
          <label>Regex<input style={{ width: "100%" }} value={field.validation.regex ?? ""} onChange={(e) => patchField({ validation: { ...field.validation, regex: e.target.value || undefined } })} /></label>
          <label>Error message<input style={{ width: "100%" }} value={field.validation.message ?? ""} onChange={(e) => patchField({ validation: { ...field.validation, message: e.target.value || undefined } })} /></label>
          <label>Show only when field<select style={{ width: "100%" }} value={field.visibleIf?.fieldKey ?? ""} onChange={(e) => patchField({ visibleIf: e.target.value ? { fieldKey: e.target.value, equals: field.visibleIf?.equals ?? "done" } : null })}><option value="">(always)</option>{secs.flatMap((s) => s.fields).filter((f) => f.key !== field.key).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
          {field.visibleIf && <label>…equals (done / not_done / na / a value)<input style={{ width: "100%" }} value={field.visibleIf.equals} onChange={(e) => patchField({ visibleIf: { ...field.visibleIf!, equals: e.target.value } })} /></label>}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label><input type="checkbox" checked={field.required} onChange={(e) => patchField({ required: e.target.checked })} /> Required</label>
          <label><input type="checkbox" checked={field.allowNote} onChange={(e) => patchField({ allowNote: e.target.checked })} /> Allow note</label>
          <label><input type="checkbox" checked={field.allowPhoto} onChange={(e) => patchField({ allowPhoto: e.target.checked })} /> Allow photo</label>
          <label><input type="checkbox" checked={field.hidden} onChange={(e) => patchField({ hidden: e.target.checked })} /> Hidden</label>
          <button className="danger" onClick={delField}>Delete field</button></div></div>}
    </div>
    <aside className="phone" aria-label="Mobile preview"><b>{sec?.name}</b><p className="muted">{sec?.description}</p>
      {sec?.groups.map((g) => <div key={g.id}><i>{g.name}</i>{sec.fields.filter((f) => f.groupId === g.id && !f.hidden).map((f) => <Preview key={f.key} f={f} />)}</div>)}
      {sec?.fields.filter((f) => !f.groupId && !f.hidden).map((f) => <Preview key={f.key} f={f} />)}
    </aside></div></>);
}

function Preview({ f }: { f: Field }) {
  return <div className="item"><b>{f.label}{f.required ? " *" : ""}</b>
    {f.type === "checklist" ? <div className="seg"><span>Done</span><span>Not done</span><span>N/A</span></div> : <div className="muted">[{f.type}{f.options.length ? `: ${f.options.join(" / ")}` : ""}] {f.placeholder}</div>}
    {f.type === "checklist" && f.options.length > 0 && <div className="muted">▾ {f.options.join(" / ")}</div>}
    {f.helpText && <small className="muted">{f.helpText}</small>}</div>;
}
