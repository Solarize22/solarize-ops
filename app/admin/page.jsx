"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";
import {
  Users, Shield, Plus, Pencil, Trash2, Check, X,
  ChevronDown, AlertTriangle, RefreshCw, Settings,
  Eye, EyeOff, Lock, DollarSign, ClipboardList,
  CalendarDays, BarChart3, Wrench, UserCheck,
} from "lucide-react";

const ROLES = ["owner", "admin", "installer", "salesperson"];

const ROLE_META = {
  owner:       { label: "Owner",       color: "#f59e0b", bg: "#fef3c7", icon: Shield },
  admin:       { label: "Admin",       color: "#3b82f6", bg: "#dbeafe", icon: UserCheck },
  installer:   { label: "Installer",   color: "#10b981", bg: "#d1fae5", icon: Users },
  salesperson: { label: "Salesperson", color: "#8b5cf6", bg: "#ede9fe", icon: Users },
};

const PERMISSIONS_MATRIX = [
  {
    category: "Jobs & Pipeline",
    icon: ClipboardList,
    rows: [
      { label: "View all jobs",          owner: true,  admin: true,  installer: false, salesperson: true  },
      { label: "View assigned jobs",     owner: true,  admin: true,  installer: true,  salesperson: true  },
      { label: "Update job status",      owner: true,  admin: true,  installer: true,  salesperson: false },
      { label: "Create / edit jobs",     owner: true,  admin: true,  installer: false, salesperson: false },
    ],
  },
  {
    category: "Financial Data",
    icon: DollarSign,
    rows: [
      { label: "View M1 / M2 amounts",   owner: true,  admin: false, installer: false, salesperson: false },
      { label: "View contract amounts",  owner: true,  admin: false, installer: false, salesperson: false },
      { label: "View invoices",          owner: true,  admin: false, installer: false, salesperson: false },
      { label: "Mark payments received", owner: true,  admin: false, installer: false, salesperson: false },
    ],
  },
  {
    category: "Scheduling & Service",
    icon: CalendarDays,
    rows: [
      { label: "View scheduling",        owner: true,  admin: true,  installer: true,  salesperson: false },
      { label: "View service tickets",   owner: true,  admin: true,  installer: true,  salesperson: false },
    ],
  },
  {
    category: "Reports & Analytics",
    icon: BarChart3,
    rows: [
      { label: "View reports",           owner: true,  admin: true,  installer: false, salesperson: false },
      { label: "View revenue data",      owner: true,  admin: false, installer: false, salesperson: false },
    ],
  },
  {
    category: "Admin & Settings",
    icon: Settings,
    rows: [
      { label: "Manage employees",       owner: true,  admin: false, installer: false, salesperson: false },
      { label: "Change roles",           owner: true,  admin: false, installer: false, salesperson: false },
      { label: "Import / Export CSV",    owner: true,  admin: true,  installer: false, salesperson: false },
    ],
  },
];

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || ROLE_META.installer;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: meta.bg, color: meta.color,
    }}>
      {meta.label}
    </span>
  );
}

function PermCheck({ value }) {
  return value
    ? <Check size={14} style={{ color: "#10b981" }} />
    : <X     size={14} style={{ color: "#9ca3af" }} />;
}

// ── Add / Edit Employee Modal ─────────────────────────────────────────────────

function EmployeeModal({ employee, onClose, onSave }) {
  const isEdit = !!employee?.id;
  const [form, setForm] = useState({
    name:   employee?.name   || "",
    email:  employee?.email  || "",
    role:   employee?.role   || "installer",
    status: employee?.status || "active",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true); setError("");
    try {
      const url    = isEdit ? `/api/employees/${employee.id}` : "/api/employees";
      const method = isEdit ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        return;
      }
      const saved = await res.json();
      onSave(saved, isEdit);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#1a1917", border: "1px solid #333",
        borderRadius: 16, padding: 28, width: 440, maxWidth: "90vw",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>
            {isEdit ? "Edit Employee" : "Add Employee"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
              Full Name *
            </label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Tommy Solarize"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                background: "#111", border: "1px solid #333",
                color: "#fff", fontSize: 13, fontFamily: "var(--font-body)",
              }}
            />
          </div>

          {/* Email */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
              Email (for login matching)
            </label>
            <input
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="e.g. tommy@solarizehomeenergy.com"
              type="email"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                background: "#111", border: "1px solid #333",
                color: "#fff", fontSize: 13, fontFamily: "var(--font-body)",
              }}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
              Must match their Clerk login email exactly.
            </div>
          </div>

          {/* Role */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
              Role
            </label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                background: "#111", border: "1px solid #333",
                color: "#fff", fontSize: 13, fontFamily: "var(--font-body)", cursor: "pointer",
              }}
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 5 }}>
              Status
            </label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 8,
                background: "#111", border: "1px solid #333",
                color: "#fff", fontSize: 13, fontFamily: "var(--font-body)", cursor: "pointer",
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: "8px 12px", borderRadius: 8, background: "#7f1d1d22", border: "1px solid #7f1d1d55", color: "#fca5a5", fontSize: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid #333",
            background: "transparent", color: "#9ca3af", fontSize: 13, cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: saving ? "#374151" : "#f59e0b",
            color: saving ? "#9ca3af" : "#111", fontSize: 13, fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer", fontFamily: "var(--font-body)",
          }}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const router   = useRouter();
  const { loading, isOwner } = useUserRole();

  const [employees, setEmployees] = useState([]);
  const [fetching,  setFetching]  = useState(true);
  const [modal,     setModal]     = useState(null);   // null | "add" | employee object
  const [deleting,  setDeleting]  = useState(null);   // id being deleted
  const [tab,       setTab]       = useState("team"); // "team" | "permissions"
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState("");

  // Redirect non-owners
  useEffect(() => {
    if (!loading && !isOwner) router.replace("/");
  }, [loading, isOwner, router]);

  // Fetch employees
  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/employees")
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [isOwner]);

  function handleSave(saved, isEdit) {
    setEmployees(prev =>
      isEdit
        ? prev.map(e => e.id === saved.id ? saved : e)
        : [...prev, saved]
    );
    setModal(null);
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this employee? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await fetch(`/api/employees/${id}`, { method: "DELETE" });
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch {}
    setDeleting(null);
  }

  async function handleMigrate() {
    setMigrating(true); setMigrateMsg("");
    try {
      const res = await fetch("/api/migrate", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setEmployees(Array.isArray(data.users) ? data.users : []);
        setMigrateMsg(`✓ Seeded ${data.users?.length || 0} team members successfully.`);
      } else {
        setMigrateMsg("Migration failed: " + (data.error || "Unknown error"));
      }
    } catch {
      setMigrateMsg("Network error during migration.");
    }
    setMigrating(false);
  }

  if (loading) {
    return (
      <AppShell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "var(--text-tertiary)" }}>
          Loading…
        </div>
      </AppShell>
    );
  }

  if (!isOwner) return null;

  const activeCount   = employees.filter(e => e.status === "active").length;
  const inactiveCount = employees.filter(e => e.status === "inactive").length;

  return (
    <AppShell>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Shield size={18} style={{ color: "#f59e0b" }} />
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Admin &amp; Settings</h1>
            </div>
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13 }}>
              Manage team members, roles, and access permissions. Owner only.
            </p>
          </div>
          <button
            onClick={() => setModal("add")}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "#f59e0b", color: "#111", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font-body)",
            }}
          >
            <Plus size={14} /> Add Employee
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {[
          { key: "team",        label: "Team Members" },
          { key: "permissions", label: "Permissions Matrix" },
          { key: "security",    label: "Security" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "8px 16px", fontSize: 13, cursor: "pointer",
            fontFamily: "var(--font-body)", border: "none", background: "transparent",
            borderBottom: tab === key ? "2px solid #f59e0b" : "2px solid transparent",
            color: tab === key ? "#f59e0b" : "var(--text-secondary)",
            fontWeight: tab === key ? 600 : 400,
            marginBottom: -1,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Team Members ── */}
      {tab === "team" && (
        <div>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Total employees", value: employees.length, color: "#f59e0b" },
              { label: "Active",          value: activeCount,       color: "#10b981" },
              { label: "Inactive",        value: inactiveCount,     color: "#6b7280" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Seed prompt */}
          {employees.length === 0 && !fetching && (
            <div style={{
              background: "#fef3c722", border: "1px solid #f59e0b44",
              borderRadius: 12, padding: 20, marginBottom: 20,
              display: "flex", alignItems: "flex-start", gap: 12,
            }}>
              <AlertTriangle size={18} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No employees set up yet</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Run the initial seed to add Tommy (owner), Matt &amp; Jake (installers), and Kyle (salesperson).
                  You can edit emails afterward so login matching works.
                </div>
                <button
                  onClick={handleMigrate}
                  disabled={migrating}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8, border: "1px solid #f59e0b55",
                    background: "#f59e0b22", color: "#f59e0b", fontSize: 12, fontWeight: 600,
                    cursor: migrating ? "not-allowed" : "pointer", fontFamily: "var(--font-body)",
                  }}
                >
                  <RefreshCw size={12} style={{ animation: migrating ? "spin 1s linear infinite" : "none" }} />
                  {migrating ? "Seeding…" : "Seed initial team"}
                </button>
                {migrateMsg && (
                  <div style={{ marginTop: 8, fontSize: 12, color: migrateMsg.startsWith("✓") ? "#10b981" : "#fca5a5" }}>
                    {migrateMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Employee table */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {fetching ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>Loading…</div>
            ) : employees.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)" }}>
                No employees yet. Add one above or seed the initial team.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                    {["Name", "Email", "Role", "Status", "Actions"].map(h => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left", fontSize: 11,
                        fontWeight: 600, color: "var(--text-tertiary)",
                        textTransform: "uppercase", letterSpacing: ".05em",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <tr key={emp.id} style={{
                      borderBottom: "0.5px solid var(--border)",
                      background: i % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                    }}>
                      <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: ROLE_META[emp.role]?.bg || "#f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700,
                            color: ROLE_META[emp.role]?.color || "#334155",
                            flexShrink: 0,
                          }}>
                            {emp.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          {emp.name || "—"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: 12 }}>
                        {emp.email || <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>no email set</span>}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <RoleBadge role={emp.role} />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                          background: emp.status === "active" ? "#d1fae5" : "#f1f5f9",
                          color:      emp.status === "active" ? "#065f46"  : "#6b7280",
                        }}>
                          {emp.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => setModal(emp)}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "5px 10px", borderRadius: 6,
                              border: "0.5px solid var(--border)", background: "var(--surface)",
                              color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
                              fontFamily: "var(--font-body)",
                            }}
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(emp.id)}
                            disabled={deleting === emp.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 4,
                              padding: "5px 10px", borderRadius: 6,
                              border: "0.5px solid #fca5a544", background: "#fee2e211",
                              color: "#dc2626", fontSize: 11,
                              cursor: deleting === emp.id ? "not-allowed" : "pointer",
                              fontFamily: "var(--font-body)",
                            }}
                          >
                            <Trash2 size={11} /> {deleting === emp.id ? "…" : "Remove"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Re-seed button (when employees exist) */}
          {employees.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={handleMigrate}
                disabled={migrating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8,
                  border: "0.5px solid var(--border)", background: "var(--surface)",
                  color: "var(--text-secondary)", fontSize: 12, cursor: migrating ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                <RefreshCw size={11} style={{ animation: migrating ? "spin 1s linear infinite" : "none" }} />
                {migrating ? "Seeding…" : "Seed missing team members"}
              </button>
              {migrateMsg && (
                <span style={{ fontSize: 12, color: migrateMsg.startsWith("✓") ? "#10b981" : "#dc2626" }}>
                  {migrateMsg}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Permissions Matrix ── */}
      {tab === "permissions" && (
        <div>
          <div style={{ marginBottom: 16, color: "var(--text-secondary)", fontSize: 13 }}>
            This matrix shows what each role can see and do in the CRM.
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", width: "40%" }}>
                    Permission
                  </th>
                  {ROLES.map(r => (
                    <th key={r} style={{ padding: "12px 16px", textAlign: "center", fontWeight: 600, fontSize: 11, color: ROLE_META[r].color, textTransform: "uppercase", letterSpacing: ".05em" }}>
                      {ROLE_META[r].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS_MATRIX.map(({ category, icon: Icon, rows }) => (
                  <>
                    <tr key={category} style={{ background: "var(--surface-3)" }}>
                      <td colSpan={5} style={{ padding: "8px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                          <Icon size={12} />
                          {category}
                        </div>
                      </td>
                    </tr>
                    {rows.map(row => (
                      <tr key={row.label} style={{ borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "10px 16px 10px 28px", color: "var(--text-primary)" }}>
                          {row.label}
                        </td>
                        {ROLES.map(r => (
                          <td key={r} style={{ padding: "10px 16px", textAlign: "center" }}>
                            <PermCheck value={row[r]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Security ── */}
      {tab === "security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            {
              icon: Lock,
              title: "Financial Data Protection",
              desc: "M1/M2 amounts, contract values, invoice numbers, and payment totals are hidden from the API response for all non-owner roles. Even if an employee inspects network requests, they will not see financial figures.",
              status: "enabled",
            },
            {
              icon: EyeOff,
              title: "Installer Job Filtering",
              desc: "Installers only receive jobs where their name appears in the crew list. All other jobs are filtered server-side before the response is sent.",
              status: "enabled",
            },
            {
              icon: Shield,
              title: "Admin Panel Access Control",
              desc: "The /admin route and all /api/employees endpoints require the owner role. Non-owners are redirected immediately.",
              status: "enabled",
            },
            {
              icon: Eye,
              title: "Invoice Page Access",
              desc: "The Invoices page is hidden from the sidebar and blocked for non-owners, who are redirected to the dashboard.",
              status: "enabled",
            },
            {
              icon: Users,
              title: "Authentication",
              desc: "All routes are protected by Clerk authentication. Unauthenticated users are redirected to /sign-in. Employee records are matched by Clerk user email for role assignment.",
              status: "enabled",
            },
          ].map(({ icon: Icon, title, desc, status }) => (
            <div key={title} className="card" style={{ padding: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon size={16} style={{ color: "#059669" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    background: "#d1fae5", color: "#065f46",
                  }}>
                    {status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{
            background: "#fef3c722", border: "1px solid #f59e0b44",
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: "#f59e0b" }}>
              Setup tip: Configure owner email
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
              Set the <code style={{ background: "#00000020", padding: "1px 5px", borderRadius: 4 }}>OWNER_EMAILS</code> environment
              variable (comma-separated) so the system automatically assigns the owner role when those emails log in.
              Example: <code style={{ background: "#00000020", padding: "1px 5px", borderRadius: 4 }}>OWNER_EMAILS=tommy@solarizehomeenergy.com</code>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal && (
        <EmployeeModal
          employee={modal === "add" ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  );
}
