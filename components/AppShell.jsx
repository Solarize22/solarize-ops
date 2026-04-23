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
  MoonStar,
  SunMedium,
  Wrench,
  Upload,
  Shield,
  Settings,
  Users,
} from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";
import { useTheme } from "@/lib/theme";

const ALL_NAV = [
  { href: "/",           label: "Command center", icon: Home,          roles: null },
  { href: "/customers",  label: "Customers",      icon: Users,         roles: null },
  { href: "/jobs",       label: "Jobs",            icon: ClipboardList, roles: null },
  { href: "/scheduling", label: "Scheduling",      icon: CalendarDays,  roles: ["owner","admin","installer"] },
  { href: "/invoices",   label: "Invoices",        icon: DollarSign,    roles: ["owner","admin"] },
  { href: "/service",    label: "Service",         icon: Wrench,        roles: ["owner","admin","installer"] },
  { href: "/reports",    label: "Reports",         icon: BarChart3,     roles: ["owner","admin"] },
  { href: "/settings",   label: "Settings",        icon: Settings,      roles: null },
  { href: "/import",     label: "Import jobs",     icon: Upload,        roles: ["owner","admin"] },
  { href: "/admin",      label: "Admin",           icon: Shield,        roles: ["owner"] },
];

const NAV_GROUPS = [
  { key: "overview", label: "Overview", items: ["/", "/customers", "/jobs"] },
  { key: "operations", label: "Operations", items: ["/scheduling", "/service", "/invoices", "/reports"] },
  { key: "workspace", label: "Workspace", items: ["/settings", "/import", "/admin"] },
];

function RoleBadge({ role }) {
  const colors = {
    owner:       { bg: "#fef3c7", color: "#92400e" },
    admin:       { bg: "#dbeafe", color: "#1e40af" },
    installer:   { bg: "#d1fae5", color: "#065f46" },
    salesperson: { bg: "#ede9fe", color: "#5b21b6" },
    sales:       { bg: "#ede9fe", color: "#5b21b6" },
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
  const { resolvedTheme, toggleTheme } = useTheme();

  const navItems = ALL_NAV.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(role);
  });

  const navByHref = new Map(navItems.map((item) => [item.href, item]));

  return (
    <div className="app-shell">
      <aside className="app-sidebar" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <Image
              src="/logo-2026.png"
              alt="Solarize Home Energy"
              width={180}
              height={72}
              style={{ objectFit: "contain", width: "100%", height: "auto" }}
              priority
            />
          </div>
          <div className="sidebar-brand-copy">
            <div className="sidebar-brand-label">Solarize Operations</div>
            <div className="sidebar-brand-subtitle">CRM and install workflow</div>
          </div>
        </div>

        <button type="button" className="theme-toggle" onClick={toggleTheme}>
          {resolvedTheme === "dark" ? <SunMedium size={14} /> : <MoonStar size={14} />}
          {resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        </button>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const items = group.items
              .map((href) => navByHref.get(href))
              .filter(Boolean);

            if (items.length === 0) return null;

            return (
              <div key={group.key} className="sidebar-group">
                <div className="sidebar-group-label">{group.label}</div>
                {items.map(({ href, label, icon: Icon }) => {
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
                      ].filter(Boolean).join(" ")}
                    >
                      <Icon size={15} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {!loading && user && (
          <div className="sidebar-card sidebar-user-card">
            <div className="sidebar-user-avatar">
              {(user.name || user.email || "U").trim().slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
          </div>
        )}

        <div className="sidebar-card sidebar-focus-card">
          <div className="sidebar-card-title">Today's focus</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {role === "installer"
              ? "Confirm your next field touchpoints and update job movement quickly."
              : role === "salesperson"
              ? "Work follow-ups, keep homeowner communication warm, and move the pipeline."
              : "Lead with follow-up, unblock customers, and keep installs and billing moving."}
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
