"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  DollarSign,
  Home,
  Wrench,
  Upload,
  Shield,
  LogOut,
} from "lucide-react";
import { UserRoleProvider, useUserRole } from "@/lib/useUserRole";
import { useClerk } from "@clerk/nextjs";

const ALL_NAV = [
  { href: "/",           label: "Dashboard",      icon: Home,          roles: null },
  { href: "/jobs",       label: "Jobs",            icon: ClipboardList, roles: null },
  { href: "/scheduling", label: "Scheduling",      icon: CalendarDays,  roles: ["owner","admin","installer"] },
  { href: "/invoices",   label: "Invoices",        icon: DollarSign,    roles: ["owner"] },
  { href: "/service",    label: "Service",         icon: Wrench,        roles: ["owner","admin","installer"] },
  { href: "/reports",    label: "Reports",         icon: BarChart3,     roles: ["owner","admin"] },
  { href: "/import",     label: "Import jobs",     icon: Upload,        roles: ["owner","admin"] },
  { href: "/admin",      label: "Admin & Settings", icon: Shield,       roles: ["owner"] },
];

function RoleBadge({ role }) {
  const colors = {
    owner:       { bg: "#fef3c7", color: "#92400e" },
    admin:       { bg: "#dbeafe", color: "#1e40af" },
    installer:   { bg: "#d1fae5", color: "#065f46" },
    salesperson: { bg: "#ede9fe", color: "#5b21b6" },
  };
  const c = colors[role] || colors.installer;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
      background: c.bg, color: c.color, textTransform: "capitalize",
    }}>
      {role}
    </span>
  );
}

function SidebarContent({ children }) {
  const pathname = usePathname();
  const { user, loading, role, isOwner } = useUserRole();
  const { signOut } = useClerk();

  const navItems = ALL_NAV.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

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
        <div style={{ padding: "6px 10px 18px" }}>
          <Image
            src="/logo.jpg"
            alt="Solarize Home Energy"
            width={180}
            height={72}
            style={{ objectFit: "contain", width: "100%", height: "auto" }}
            priority
          />
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1 }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const isAdmin = href === "/admin";
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
                  color: active ? "white" : isAdmin ? "#f59e0b" : "var(--text-secondary)",
                  background: active ? (isAdmin ? "#92400e" : "var(--text-primary)") : "transparent",
                  textDecoration: "none",
                  transition: "all 0.12s ease",
                  marginTop: label === "Import jobs" ? 8 : isAdmin ? 4 : 0,
                  borderTop: label === "Import jobs" ? "1px solid var(--border)" : isAdmin ? "1px solid var(--border)" : "none",
                  paddingTop: (label === "Import jobs" || isAdmin) ? 10 : 8,
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = isAdmin ? "#fef3c744" : "var(--surface-2)"; e.currentTarget.style.color = isAdmin ? "#f59e0b" : "var(--text-primary)"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = isAdmin ? "#f59e0b" : "var(--text-secondary)"; }}}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        {!loading && user && (
          <div style={{
            marginTop: 8,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "10px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                {user.name || user.email || "User"}
              </div>
              <RoleBadge role={role} />
            </div>
            {user.email && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 8 }}>
                {user.email}
              </div>
            )}
            <button
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 11,
                fontWeight: 600,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                fontFamily: "var(--font-body)",
                transition: "all 0.12s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
              <LogOut size={12} />
              Logout
            </button>
          </div>
        )}

        {/* Today's focus */}
        <div style={{
          marginTop: 8,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "12px 14px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Today's focus</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {role === "installer"
              ? "Check your assigned jobs and update install status."
              : role === "salesperson"
              ? "Track your leads and keep the pipeline moving."
              : "Keep installs moving, resolve issues, and chase down missing M2 payments."}
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

export default function AppShell({ children }) {
  return (
    <UserRoleProvider>
      <SidebarContent>{children}</SidebarContent>
    </UserRoleProvider>
  );
}
