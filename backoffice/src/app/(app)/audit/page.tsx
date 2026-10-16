"use client";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { fmtDate } from "@/lib/util";

interface Log { id: string; actor?: { name: string }; action: string; target: string; details?: object; at?: { toDate(): Date } }
export default function Audit() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => onSnapshot(query(collection(db, "auditLogs"), orderBy("at", "desc"), limit(200)), (s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Log))), []);
  return (<><h1>Audit Log</h1><div className="tablewrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
    <tbody>{logs.map((l) => <tr key={l.id}><td>{fmtDate(l.at)}</td><td>{l.actor?.name}</td><td>{l.action}</td><td>{l.target}</td><td className="muted">{JSON.stringify(l.details)}</td></tr>)}
      {logs.length === 0 && <tr><td colSpan={5} className="muted">No entries</td></tr>}</tbody></table></div></>);
}
