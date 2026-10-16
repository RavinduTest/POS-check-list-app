"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/records", label: "Records", icon: "☰" },
  { href: "/review", label: "Pending Review", icon: "✔" },
  { href: "/users", label: "Users", icon: "☺", admin: true },
  { href: "/builder", label: "Checklist Builder", icon: "✎", admin: true },
  { href: "/versions", label: "Template Versions", icon: "⌛", admin: true },
  { href: "/audit", label: "Audit Log", icon: "⚑" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, name, loading, logout } = useAuth();
  const router = useRouter(); const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) return <div className="page muted">Loading…</div>;

  return (
    <div className="shell">
      <nav className={`side ${collapsed ? "collapsed" : ""}`} aria-label="Main">
        <div className="brand"><span className="lbl">SERP POS</span><button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar" style={{ marginLeft: 8, padding: "2px 8px" }}>☰</button></div>
        {NAV.filter((n) => !n.admin || role === "admin").map((n) => (
          <Link key={n.href} href={n.href} className={path === n.href || (n.href !== "/" && path.startsWith(n.href)) ? "active" : ""}>
            <span>{n.icon}</span><span className="lbl">{n.label}</span>
          </Link>
        ))}
      </nav>
      <div className="main">
        <header className="top">
          <form style={{ flex: 1 }} onSubmit={(e) => { e.preventDefault(); router.push(`/records?q=${encodeURIComponent(q)}`); }}>
            <input style={{ width: "100%", maxWidth: 480 }} placeholder="Search company, branch, terminal, AnyDesk, record no…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" />
          </form>
          <span className="muted">{name} · {role}</span>
          <button onClick={logout}>Logout</button>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
