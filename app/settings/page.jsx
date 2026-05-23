"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, LogOut, Monitor, Moon, Palette, RefreshCw, Sun, Unplug } from "lucide-react";
import { useClerk } from "@clerk/nextjs";
import AppShell from "@/components/AppShell";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import { useTheme } from "@/lib/theme";
import { useUserRole } from "@/lib/useUserRole";
import { appConfig } from "@/lib/app-config";

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

const EMPTY_CALENDAR_STATE = {
  loading: true,
  installed: false,
  configReady: false,
  missing: [],
  redirectUri: "",
  appBaseUrl: "",
  scope: "",
  timezone: "",
  connected: false,
  connection: null,
  availableCalendars: [],
  linkedEventCount: 0,
  canManage: false,
};

function formatDateTime(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export default function SettingsPage() {
  const { user, role } = useUserRole();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { signOut } = useClerk();
  const [calendarState, setCalendarState] = useState(EMPTY_CALENDAR_STATE);
  const [calendarId, setCalendarId] = useState("");
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState({ type: "", text: "" });

  const canManageIntegration = useMemo(
    () => role === "owner" || role === "admin" || role === "ops",
    [role]
  );

  async function loadCalendarState() {
    setCalendarState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch("/api/v2/integrations/google-calendar");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load Google Calendar settings");
      setCalendarState({
        loading: false,
        installed: data.installed !== false,
        configReady: !!data.configReady,
        missing: Array.isArray(data.missing) ? data.missing : [],
        redirectUri: data.redirectUri || "",
        appBaseUrl: data.appBaseUrl || "",
        scope: data.scope || "",
        timezone: data.timezone || "",
        connected: !!data.connected,
        connection: data.connection || null,
        availableCalendars: Array.isArray(data.availableCalendars) ? data.availableCalendars : [],
        linkedEventCount: data.linkedEventCount || 0,
        canManage: !!data.canManage,
      });
    } catch (error) {
      setCalendarState((prev) => ({
        ...prev,
        loading: false,
      }));
      setCalendarMessage({ type: "error", text: error.message || "Failed to load Google Calendar settings" });
    }
  }

  useEffect(() => {
    loadCalendarState();
  }, []);

  useEffect(() => {
    if (calendarState.connection?.calendarId) {
      setCalendarId(calendarState.connection.calendarId);
    }
  }, [calendarState.connection?.calendarId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("googleCalendar");
    const error = params.get("googleCalendarError");
    if (status === "connected") {
      setCalendarMessage({ type: "success", text: "Google Calendar connected. Pick the target calendar below and run a sync." });
      loadCalendarState();
    } else if (error) {
      setCalendarMessage({ type: "error", text: decodeURIComponent(error) });
    }
  }, []);

  async function saveSelectedCalendar() {
    if (!calendarId) return;
    setCalendarBusy(true);
    setCalendarMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/integrations/google-calendar", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ calendarId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save calendar selection");
      setCalendarMessage({ type: "success", text: "Target Google Calendar updated." });
      await loadCalendarState();
    } catch (error) {
      setCalendarMessage({ type: "error", text: error.message || "Failed to save calendar selection" });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function syncCalendar() {
    setCalendarBusy(true);
    setCalendarMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/integrations/google-calendar/sync", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Google Calendar sync failed");

      const detail = `Created ${data.created || 0}, updated ${data.updated || 0}, removed ${data.removed || 0}.`;
      const suffix = Array.isArray(data.errors) && data.errors.length > 0 ? ` ${data.errors[0]}` : "";
      setCalendarMessage({
        type: data.status === "success" ? "success" : "error",
        text: `${detail}${suffix}`,
      });
      await loadCalendarState();
    } catch (error) {
      setCalendarMessage({ type: "error", text: error.message || "Google Calendar sync failed" });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function pullCalendarIntoCrm() {
    setCalendarBusy(true);
    setCalendarMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/integrations/google-calendar/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ direction: "pull" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Google Calendar inbound sync failed");

      const detail = `Updated ${data.updated || 0} CRM record${data.updated === 1 ? "" : "s"}, skipped ${data.skipped || 0}.`;
      const suffix = Array.isArray(data.errors) && data.errors.length > 0 ? ` ${data.errors[0]}` : "";
      setCalendarMessage({
        type: data.status === "success" ? "success" : "error",
        text: `${detail}${suffix}`,
      });
      await loadCalendarState();
    } catch (error) {
      setCalendarMessage({ type: "error", text: error.message || "Google Calendar inbound sync failed" });
    } finally {
      setCalendarBusy(false);
    }
  }

  async function disconnectCalendar() {
    setCalendarBusy(true);
    setCalendarMessage({ type: "", text: "" });
    try {
      const res = await fetch("/api/v2/integrations/google-calendar", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to disconnect Google Calendar");
      setCalendarMessage({ type: "success", text: "Google Calendar disconnected from this CRM." });
      await loadCalendarState();
    } catch (error) {
      setCalendarMessage({ type: "error", text: error.message || "Failed to disconnect Google Calendar" });
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <AppShell>
      <WorkspaceHeader
        eyebrow="Workspace"
        title="Settings and shared controls"
        description="Adjust how the workspace feels, keep account actions easy to find, and manage shared integrations without accidentally touching live CRM records."
        aside={(
          <div
            className="card"
            style={{
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,248,251,0.96) 100%)",
            }}
          >
            <div className="panel-kicker">Workspace status</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {user?.name || user?.email || "Signed in"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Role: <span style={{ textTransform: "capitalize" }}>{role}</span> · Theme: <span style={{ textTransform: "capitalize" }}>{resolvedTheme}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {calendarState.connected
                ? `Google Calendar connected${calendarState.connection?.connectedEmail ? ` as ${calendarState.connection.connectedEmail}` : ""}.`
                : "Google Calendar is not connected yet."}
            </div>
          </div>
        )}
      >
        <span className="hero-chip">
          {calendarState.loading ? "Loading calendar..." : calendarState.connected ? "Calendar connected" : "Calendar not connected"}
        </span>
        <span className="hero-chip">
          {calendarState.loading ? "Checking config..." : calendarState.configReady ? "OAuth ready" : "OAuth setup needed"}
        </span>
        <span className="hero-chip">
          {theme === "system" ? "Following system theme" : `${resolvedTheme} workspace`}
        </span>
      </WorkspaceHeader>

      <div className="soft-stat-grid" style={{ marginBottom: 20 }}>
        <div className="soft-stat">
          <div className="soft-stat-label">Account role</div>
          <div className="soft-stat-value" style={{ fontSize: 22, textTransform: "capitalize" }}>{role}</div>
          <div className="soft-stat-detail">Permissions shape which tools and financial views you can access.</div>
        </div>
        <div className="soft-stat">
          <div className="soft-stat-label">Theme mode</div>
          <div className="soft-stat-value" style={{ fontSize: 22, textTransform: "capitalize" }}>{resolvedTheme}</div>
          <div className="soft-stat-detail">{theme === "system" ? "Your device setting is currently driving the theme." : "Theme choice is saved for your workspace."}</div>
        </div>
        <div className="soft-stat">
          <div className="soft-stat-label">Calendar sync</div>
          <div className="soft-stat-value" style={{ fontSize: 22 }}>{calendarState.connected ? calendarState.linkedEventCount : 0}</div>
          <div className="soft-stat-detail">{calendarState.connected ? "CRM events currently linked to Google Calendar." : "No shared calendar connection is active yet."}</div>
        </div>
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
            Personal controls for your login live here. Shared company integrations also show up here so they are easy to find.
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
            <span className="panel-kicker">Environment</span>
            <span>{appConfig.environmentLabel || "Production"}</span>
          </div>
          <div className="settings-summary-row">
            <span className="panel-kicker">Active theme</span>
            <span style={{ textTransform: "capitalize" }}>{resolvedTheme}</span>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="panel-title" style={{ fontSize: 14, marginBottom: 6 }}>Account actions</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
              Lower-frequency actions sit here so they are harder to hit accidentally during active operations work.
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
              Timezone, date display, denser tables, dashboard defaults, notification preferences, and reminder defaults can all live here next.
            </div>
          </div>
        </section>

        <section className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div className="settings-icon-wrap">
              <CalendarDays size={16} />
            </div>
            <div>
              <div className="panel-title">Google Calendar</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Sync installs, inspections, and field visits from the CRM into a single Google Calendar.
              </div>
            </div>
          </div>

          {calendarMessage.text ? (
            <div
              style={{
                marginTop: 14,
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 12,
                border: calendarMessage.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
                background: calendarMessage.type === "success" ? "#f0fdf4" : "#fff1f2",
                color: calendarMessage.type === "success" ? "#166534" : "#991b1b",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {calendarMessage.text}
            </div>
          ) : null}

          {calendarState.loading ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 14 }}>Loading Google Calendar settings...</div>
          ) : !calendarState.installed ? (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "#fff8e8", border: "1px solid #f3d489", color: "#8a5308", fontSize: 13, lineHeight: 1.6 }}>
              Apply `db/migrations/006_google_calendar_sync.sql` to enable the Google Calendar connection and CRM event link tracking.
            </div>
          ) : !calendarState.configReady ? (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "#fff1f2", border: "1px solid #fecdd3", color: "#9f1239", fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Finish Google OAuth setup</div>
              <div>Add these environment variables before connecting Google Calendar: {calendarState.missing.join(", ")}.</div>
              <div style={{ marginTop: 10 }}>
                Use a Google Cloud OAuth web client and add this redirect URI:
              </div>
              <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 10, background: "#fff", border: "1px solid #fecdd3", fontFamily: "monospace", fontSize: 12, overflowX: "auto" }}>
                {calendarState.redirectUri || "http://localhost:3000/api/v2/integrations/google-calendar/callback"}
              </div>
              <div style={{ marginTop: 10 }}>
                Scope requested: <span style={{ fontFamily: "monospace" }}>{calendarState.scope || "https://www.googleapis.com/auth/calendar"}</span>
              </div>
            </div>
          ) : !canManageIntegration ? (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Your role can view the shared status here, but only owner, admin, or ops users can connect and sync the company calendar.
            </div>
          ) : !calendarState.connected ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 14 }}>
                Connect the Google account that should own the ops calendar. Once connected, you can choose a dedicated calendar and sync every CRM schedule item into it.
              </div>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  window.location.href = "/api/v2/integrations/google-calendar/start";
                }}
              >
                <CalendarDays size={13} />
                Connect Google Calendar
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              <div className="settings-summary-row">
                <span className="panel-kicker">Connected account</span>
                <span>{calendarState.connection?.connectedEmail || "Connected"}</span>
              </div>
              <div className="settings-summary-row">
                <span className="panel-kicker">Linked CRM events</span>
                <span>{calendarState.linkedEventCount}</span>
              </div>
              <div className="settings-summary-row">
                <span className="panel-kicker">Last sync</span>
                <span>{formatDateTime(calendarState.connection?.lastSyncedAt)}</span>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Target calendar
                </span>
                <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)} disabled={calendarBusy}>
                  {(calendarState.availableCalendars || []).map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.summary}{calendar.primary ? " (Primary)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button className="btn btn-outline" type="button" disabled={calendarBusy || !calendarId} onClick={saveSelectedCalendar}>
                  Save calendar choice
                </button>
                <button className="btn btn-primary" type="button" disabled={calendarBusy} onClick={syncCalendar}>
                  <RefreshCw size={13} />
                  Push CRM to Google
                </button>
                <button className="btn btn-outline" type="button" disabled={calendarBusy} onClick={pullCalendarIntoCrm}>
                  <RefreshCw size={13} />
                  Pull Google to CRM
                </button>
                <button className="btn btn-ghost" type="button" disabled={calendarBusy} onClick={disconnectCalendar}>
                  <Unplug size={13} />
                  Disconnect
                </button>
              </div>

              <div style={{ padding: "12px 14px", borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                Google events can now feed dates back into the CRM too. Inbound sync works best on events that are already linked to CRM records, or events clearly named with the job number and event type. Use words like `completed`, `done`, `passed`, or `failed` in the event title or description when you want the CRM to mark the work as finished.
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
