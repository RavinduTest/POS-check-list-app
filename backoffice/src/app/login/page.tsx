"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Login() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  // Redirect only once the auth provider has finished loading the user's role.
  useEffect(() => { if (!loading && user) router.replace("/"); }, [loading, user, router]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(u, p); }
    catch (x) {
      const m = (x as Error).message;
      setErr(m.includes("No back office") || m.includes("deactivated") ? m : "Invalid username or password");
    } finally { setBusy(false); }
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1 style={{ color: "var(--primary)" }}>SERP POS Back Office</h1>
      <div className="card">
        <label>Username<input style={{ width: "100%" }} value={u} onChange={(e) => setU(e.target.value)} autoFocus required /></label>
        <label>Password<input style={{ width: "100%" }} type="password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
        {err && <div className="err" role="alert">{err}</div>}
        <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </div>
    </form>
  );
}
