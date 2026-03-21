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
  Settings,
} from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

const ALL_NAV = [
  { href: "/",           label: "Dashboard",      icon: Home,          roles: null },
  { href: "/jobs",       label: "Jobs",            icon: ClipboardList, roles: null },
  { href: "/scheduling", label: "Scheduling",      icon: CalendarDays,  roles: ["owner","admin","installer"] },
  { href: "/invoices",   label: "Invoices",        icon: DollarSign,    roles: ["owner"] },
  { href: "/service",    label: "Service",         icon: Wrench,        roles: ["owner","admin","installer"] },
  { href: "/reports",    label: "Reports",         icon: BarChart3,     roles: ["owner"] },
  { href: "/settings",   label: "Settings",        icon: Settings,      roles: null },
  { href: "/import",     label: "Import jobs",     icon: Upload,        roles: ["owner","admin"] },
  { href: "/admin",      label: "Admin",           icon: Shield,        roles: ["owner"] },
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
  const { user, loading, role } = useUserRole();

  const navItems = ALL_NAV.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  return (
    <div className="app-shell">
      <aside className="app-sidebar" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="sidebar-logo">
          <Image
            src="/logo.png"
            alt="Solarize Home Energy"
            width={180}
            height={72}
            style={{ objectFit: "contain", width: "100%", height: "auto" }}
            priority
          />
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            const isAdmin = href === "/admin";
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "sidebar-link",
                  active ? "active" : "",
                  isAdmin ? "admin-link" : "",
                  label === "Import jobs" || isAdmin ? "sidebar-section-break" : "",
                ].filter(Boolean).join(" ")}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>

        {!loading && user && (
          <div className="sidebar-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                {user.name || user.email || "User"}
              </div>
              <RoleBadge role={role} />
            </div>
            {user.email && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-card">
          <div className="sidebar-card-title">Today's focus</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {role === "installer"
              ? "Check your assigned jobs and update install status."
              : role === "salesperson"
              ? "Track your leads and keep the pipeline moving."
              : "Keep installs moving, resolve issues, and chase down missing M2 payments."}
          </div>
        </div>
      </aside>

      <main className="app-main">
        {children}
      </main>
    </div>
  );
}

export default function AppShell({ children }) {
  return <SidebarContent>{children}</SidebarContent>;
}
