"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileText,
  Home,
  SunMedium,
  Wrench,
  Upload,
} from "lucide-react";

const navItems = [
  { href: "/",           label: "Dashboard",  icon: Home },
  { href: "/jobs",       label: "Jobs",       icon: ClipboardList },
  { href: "/permits",    label: "Permits",    icon: FileText },
  { href: "/scheduling", label: "Scheduling", icon: CalendarDays },
  { href: "/invoices",   label: "Invoices",   icon: DollarSign },
  { href: "/service",    label: "Service",    icon: Wrench },
  { href: "/reports",    label: "Reports",    icon: BarChart3 },
  { href: "/import",     label: "Import CSV", icon: Upload },
];

export default function AppShell({ children }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px 18px" }}>
          <div style={{
            width: 34, height: 34,
            background: "var(--text-primary)",
            borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <SunMedium size={17} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              Solarize Home Energy
            </div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 1 }}>
              Operations
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "9px",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  color: active ? "white" : "var(--text-secondary)",
                  background: active ? "var(--text-primary)" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.12s ease",
                  marginTop: label === "Import CSV" ? 8 : 0,
                  borderTop: label === "Import CSV" ? "1px solid var(--border)" : "none",
                  paddingTop: label === "Import CSV" ? 10 : 8,
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-secondary)"; }}}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Today's focus */}
        <div style={{
          marginTop: 12,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Today's focus</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Keep installs moving, catch PTO blockers, and chase down missing M2 payments.
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ padding: "28px 32px", minHeight: "100vh" }}>
        {children}
      </main>
    </div>
  );
}
