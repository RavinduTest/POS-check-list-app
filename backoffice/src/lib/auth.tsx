"use client";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { auth, db, functions, USERNAME_DOMAIN } from "./firebase";
import { Role } from "./types";

interface Ctx { user: User | null; role: Role | null; name: string; loading: boolean; login(u: string, p: string): Promise<void>; logout(): Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

const SESSION_MS = 8 * 3600_000; // AUTH-09: 8 h inactivity

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    if (!u) { setUser(null); setRole(null); setLoading(false); return; }
    const tok = await u.getIdTokenResult(true);
    const r = tok.claims.role as Role | undefined;
    if (!r || r === "technical_officer" || tok.claims.active !== true) {
      await signOut(auth); setUser(null); setRole(null); setLoading(false); return;
    }
    const snap = await getDoc(doc(db, "users", u.uid));
    setName(snap.get("fullName") ?? u.displayName ?? "");
    setUser(u); setRole(r); setLoading(false);
  }), []);

  // inactivity timeout + periodic token refresh so deactivation/role changes land within ~5 min
  useEffect(() => {
    if (!user) return;
    const touch = () => localStorage.setItem("lastActive", String(Date.now()));
    touch();
    const ev = ["click", "keydown", "mousemove"];
    ev.forEach((e) => window.addEventListener(e, touch));
    const t = setInterval(async () => {
      if (Date.now() - Number(localStorage.getItem("lastActive") ?? 0) > SESSION_MS) return void signOut(auth);
      try { await user.getIdToken(true); } catch { void signOut(auth); }
    }, 5 * 60_000);
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t); };
  }, [user]);

  async function login(username: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`, password);
    const tok = await cred.user.getIdTokenResult(true);
    if (tok.claims.role === "technical_officer" || !tok.claims.role) {
      await signOut(auth);
      throw new Error("No back office access");
    }
    if (tok.claims.active !== true) { await signOut(auth); throw new Error("Account is deactivated"); }
    void httpsCallable(functions, "markLogin")({}).catch(() => undefined);
  }

  return <AuthCtx.Provider value={{ user, role, name, loading, login, logout: () => signOut(auth) }}>{children}</AuthCtx.Provider>;
}
