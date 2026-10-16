"use client";
import { httpsCallable } from "firebase/functions";
import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRecords, useUsers } from "@/lib/data";
import { functions } from "@/lib/firebase";
import { Role, UserDoc } from "@/lib/types";
import { fmtDate } from "@/lib/util";

const call = (n: string, d: object) => httpsCallable(functions, n)(d);
const genPw = () => { const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"; const a = crypto.getRandomValues(new Uint32Array(10)); return Array.from(a, (x) => c[x % c.length]).join("") + "7a"; };
const ROLE_L: Record<Role, string> = { technical_officer: "Technical Officer", supervisor: "Supervisor", admin: "Admin" };
const empty = { fullName: "", username: "", employeeId: "", phone: "", email: "", role: "technical_officer" as Role, password: "" };

export default function Users() {
  const { role } = useAuth();
  const users = useUsers(); const { records } = useRecords();
  const [q, setQ] = useState(""); const [fr, setFr] = useState(""); const [fs, setFs] = useState("");
  const [form, setForm] = useState<(typeof empty & { uid?: string }) | null>(null);
  const [msg, setMsg] = useState(""); const [isErr, setIsErr] = useState(false); const [tried, setTried] = useState(false); const [saving, setSaving] = useState(false); const [reset, setReset] = useState<UserDoc | null>(null); const [pw, setPw] = useState("");
  const counts = useMemo(() => { const m = new Map<string, number>(); records.forEach((r) => m.set(r.technicianId, (m.get(r.technicianId) ?? 0) + 1)); return m; }, [records]);
  const rows = users.filter((u) => (!fr || u.role === fr) && (!fs || u.status === fs) && (!q || `${u.fullName} ${u.username} ${u.employeeId}`.toLowerCase().includes(q.toLowerCase())));
  if (role !== "admin") return <p>Admins only.</p>;

  const run = async (fn: () => Promise<unknown>, ok = "Done") => { setMsg(""); setIsErr(false); try { await fn(); setMsg(ok); } catch (e) { setIsErr(true); setMsg((e as Error).message); } };
  const errors = (f: typeof empty & { uid?: string }) => {
    const e: Record<string, string> = {};
    if (!f.fullName.trim()) e.fullName = "Full name is required";
    if (!f.uid) {
      if (!/^[a-z0-9._-]{3,32}$/i.test(f.username.trim())) e.username = "3–32 characters: letters, numbers, . _ - (no spaces)";
      if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(f.password)) e.password = "At least 8 characters with a letter and a number";
    }
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "Enter a valid email address";
    if (f.phone && !/^[0-9+\-\s()]{7,20}$/.test(f.phone)) e.phone = "Enter a valid phone number";
    return e;
  };
  const submit = async (e: FormEvent) => { e.preventDefault(); const f = form!; setTried(true);
    if (Object.keys(errors(f)).length) return;
    setSaving(true); setMsg(""); setIsErr(false);
    try { await (f.uid ? call("updateUser", f) : call("createUser", { ...f, username: f.username.trim().toLowerCase() })); setForm(null); setTried(false);
      setMsg(f.uid ? "User updated" : `User created. Share these login details — username: ${f.username.trim().toLowerCase()}  temporary password: ${f.password}`); }
    catch (x) { setIsErr(true); setMsg((x as Error).message); } finally { setSaving(false); } };
  const fe = form ? errors(form) : {};
  const show = (k: string) => (tried ? fe[k] : undefined);

  return (<><div className="row"><h1 style={{ margin: 0, flex: 1 }}>Users</h1><button className="primary" onClick={() => { setTried(false); setMsg(""); setForm({ ...empty, password: genPw() }); }}>New user</button></div>
    {msg && <div className={`alert ${isErr ? "error" : "ok"}`} role="status">{msg}</div>}
    <div className="row"><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={fr} onChange={(e) => setFr(e.target.value)} aria-label="Role"><option value="">All roles</option>{Object.entries(ROLE_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <select value={fs} onChange={(e) => setFs(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    <div className="tablewrap"><table><thead><tr><th>Name</th><th>Username</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Last login</th><th>Installs</th><th /></tr></thead>
      <tbody>{rows.map((u) => <tr key={u.id}><td>{u.fullName}</td><td>{u.username}</td><td>{u.employeeId}</td>
        <td><select value={u.role} onChange={(e) => run(() => call("updateUserRole", { uid: u.id, role: e.target.value }), "Role updated")}>{Object.entries(ROLE_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
        <td>{u.status}</td><td>{fmtDate(u.lastLoginAt)}</td><td>{counts.get(u.id) ?? 0}</td>
        <td><div className="row" style={{ margin: 0 }}><button onClick={() => { setTried(false); setMsg(""); setForm({ ...empty, ...u, password: "", uid: u.id }); }}>Edit</button>
          <button onClick={() => run(() => call("setUserStatus", { uid: u.id, status: u.status === "active" ? "inactive" : "active" }), "Status updated")}>{u.status === "active" ? "Deactivate" : "Reactivate"}</button>
          <button onClick={() => { setReset(u); setPw(genPw()); }}>Reset password</button>
          <button className="danger" onClick={() => confirm(`Permanently delete ${u.fullName} (${u.username})? They will no longer be able to log in. Their past records are kept.`) && run(() => call("deleteUser", { uid: u.id }), "User deleted")}>Delete</button></div></td></tr>)}</tbody></table></div>
    {form && <div className="modal"><form onSubmit={submit} noValidate><h2>{form.uid ? "Edit user" : "New user"}</h2>
      {msg && isErr && <div className="alert error" role="alert">{msg}</div>}
      <div className="form-grid">
        <label className="field full"><span>Full name *</span><input className={show("fullName") ? "invalid" : ""} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoFocus />{show("fullName") && <span className="error">{show("fullName")}</span>}</label>
        <label className="field"><span>Username *</span><input className={show("username") ? "invalid" : ""} disabled={!!form.uid} placeholder="e.g. kasun.p" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="none" />{show("username") ? <span className="error">{show("username")}</span> : <span className="hint">Used to log in. Cannot be changed later.</span>}</label>
        <label className="field"><span>Employee ID</span><input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></label>
        <label className="field"><span>Phone</span><input className={show("phone") ? "invalid" : ""} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />{show("phone") && <span className="error">{show("phone")}</span>}</label>
        <label className="field"><span>Email (optional)</span><input type="email" className={show("email") ? "invalid" : ""} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />{show("email") && <span className="error">{show("email")}</span>}</label>
        {!form.uid && <>
          <label className="field full"><span>Role *</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{Object.entries(ROLE_L).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="field full"><span>Temporary password *</span><div className="row" style={{ margin: 0, flexWrap: "nowrap" }}><input style={{ flex: 1 }} className={show("password") ? "invalid" : ""} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setForm({ ...form, password: genPw() })}>Generate</button></div>{show("password") ? <span className="error">{show("password")}</span> : <span className="hint">The user must change it at first login.</span>}</label></>}
      </div>
      <div className="actions"><button type="button" onClick={() => { setForm(null); setTried(false); }}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button></div></form></div>}
    {reset && <div className="modal"><div><h2>Reset password for {reset.fullName}</h2><input value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="row"><button className="primary" onClick={() => run(async () => { await call("resetPassword", { uid: reset.id, password: pw }); setReset(null); }, `Password reset. Temporary password: ${pw}`)}>Reset</button><button onClick={() => setReset(null)}>Cancel</button></div></div></div>}
  </>);
}
