"use client";

import { Moon, Monitor, Palette, Sun, LogOut } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import AppShell from "@/components/AppShell";
import { useTheme } from "@/lib/theme";
import { useUserRole } from "@/lib/useUserRole";

const OPTIONS = [
  {
    key: "light",
    title: "Light",
    description: "Bright workspace for daytime operations and office use.",
    icon: Sun,
  },
  {
    key: "dark",
    title: "Dark",
    description: "Low-glare workspace for long sessions and evening work.",
    icon: Moon,
  },
  {
    key: "system",
    title: "System",
    description: "Follow the device theme automatically.",
    icon: Monitor,
  },
];

export default function SettingsPage() {
  const { user, role } = useUserRole();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { signOut } = useClerk();

  return (
    <AppShell>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Adjust how your workspace looks and feels without changing shared company data.</p>
      </div>

      <div className="settings-grid">
        <section className="card card-elevated" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="settings-icon-wrap">
              <Palette size={16} />
            </div>
            <div>
              <div className="panel-title">Appearance</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Choose the theme that feels best for your daily workflow.
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
            {OPTIONS.map(({ key, title, description, icon: Icon }) => {
              const active = theme === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`settings-option ${active ? "active" : ""}`}
                  onClick={() => setTheme(key)}
                >
                  <div className="settings-option-main">
                    <div className="settings-icon-wrap subtle">
                      <Icon size={15} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{description}</div>
                    </div>
                  </div>
                  <span className={`badge ${active ? "badge-blue" : "badge-slate"}`}>
                    {active ? "Selected" : "Choose"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card" style={{ padding: 22 }}>
          <div className="panel-title" style={{ marginBottom: 6 }}>Current workspace</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            This page is personal to your login. It does not change other team members&apos; screens.
          </div>

          <div className="settings-summary-row">
            <span className="panel-kicker">Signed in</span>
            <span>{user?.name || user?.email || "Current user"}</span>
          </div>
          <div className="settings-summary-row">
            <span className="panel-kicker">Role</span>
            <span style={{ textTransform: "capitalize" }}>{role}</span>
          </div>
          <div className="settings-summary-row">
            <span className="panel-kicker">Active theme</span>
            <span style={{ textTransform: "capitalize" }}>{resolvedTheme}</span>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="panel-title" style={{ fontSize: 14, marginBottom: 6 }}>Account actions</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
              Put lower-frequency actions here so they are harder to hit by accident during daily work.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => signOut({ redirectUrl: "/sign-in" })}
              >
                <LogOut size={13} />
                Logout
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Next settings we can add here</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              Timezone, date display, denser tables, dashboard defaults, and notification preferences can all live here next once you want to personalize the workspace further.
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
