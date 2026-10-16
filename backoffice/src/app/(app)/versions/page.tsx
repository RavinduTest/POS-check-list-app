"use client";
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db, functions } from "@/lib/firebase";
import { Template } from "@/lib/types";
import { fmtDate } from "@/lib/util";

export default function Versions() {
  const { user } = useAuth();
  const [vs, setVs] = useState<(Template & { id: string })[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => onSnapshot(query(collection(db, "templateVersions"), orderBy("versionNo", "desc")), (s) => setVs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Template & { id: string }))), []);

  async function rollback(v: Template & { id: string }) {
    if (!confirm(`Republish v${v.id} as a new version?`)) return;
    try {
      const snap = await getDoc(doc(db, "templateVersions", v.id));
      await setDoc(doc(db, "templateDraft", "current"), { sections: snap.get("sections"), updatedBy: user!.uid, updatedAt: serverTimestamp() });
      const r = await httpsCallable<unknown, { versionNo: number }>(functions, "publishTemplate")({ changeSummary: `Rollback to v${v.id}` });
      setMsg(`Published v${r.data.versionNo}`);
    } catch (e) { setMsg((e as Error).message); }
  }
  return (<><h1>Template Versions</h1>{msg && <p>{msg}</p>}
    <div className="tablewrap"><table><thead><tr><th>Version</th><th>Published by</th><th>When</th><th>Sections</th><th>Summary</th><th /></tr></thead>
      <tbody>{vs.map((v) => <tr key={v.id}><td>v{v.id}</td><td>{v.publishedByName}</td><td>{fmtDate(v.publishedAt)}</td><td>{v.sections.length}</td><td>{v.changeSummary}</td><td><button onClick={() => rollback(v)}>Roll back to this</button></td></tr>)}</tbody></table></div></>);
}
