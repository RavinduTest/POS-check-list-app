"use client";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "./firebase";
import { InstallRecord, Template, UserDoc } from "./types";

export function useRecords(extra: "all" | "submitted" = "all", max = 1000) {
  const [records, setRecords] = useState<InstallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const q = extra === "submitted"
      ? query(collection(db, "records"), where("status", "==", "submitted"), orderBy("submittedAt", "asc"), limit(max))
      : query(collection(db, "records"), where("deleted", "==", false), orderBy("createdAt", "desc"), limit(max));
    return onSnapshot(q, (s) => { setRecords(s.docs.map((d) => ({ id: d.id, ...d.data() }) as InstallRecord).filter((r) => !r.deleted)); setLoading(false); }, () => setLoading(false));
  }, [extra, max]);
  return { records, loading };
}

export function useUsers() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  useEffect(() => onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDoc))), []);
  return users;
}

export function useTemplateVersion(v?: number) {
  const [t, setT] = useState<Template | null>(null);
  useEffect(() => { if (v) return onSnapshot(doc(db, "templateVersions", String(v)), (s) => setT(s.data() as Template)); }, [v]);
  return t;
}
