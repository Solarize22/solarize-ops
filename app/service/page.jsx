"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { statusBadgeClass, formatDate } from "@/lib/utils";
import { Search, MapPin } from "lucide-react";

const URGENCIES = ["All", "High", "Medium", "Low"];
const STATUSES = ["All", "Open", "In Progress", "Scheduled", "Resolved", "Cancelled"];

export default function ServicePage() {
  const [serviceItems, setServiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    setLoading(true);
    fetch("/api/v2/service")
      .then(r => r.ok ? r.json() : [])
      .then(data => setServiceItems(Array.isArray(data) ? data : []))
      .catch(() => setServiceItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return serviceItems.filter(item => {
      const text = [item.id, item.issue, item.customer, item.site, item.assignedTo].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchUrgency = urgencyFilter === "All" || item.urgency === urgencyFilter;
      const matchStatus = statusFilter === "All" || item.status === statusFilter;
      return matchSearch && matchUrgency && matchStatus;
    });
  }, [serviceItems, search, urgencyFilter, statusFilter]);

  const active = serviceItems.filter(s => !["Resolved", "Cancelled"].includes(s.status)).length;
  const inProgress = serviceItems.filter(s => s.status === "In Progress").length;
  const scheduled = serviceItems.filter(s => s.status === "Scheduled").length;
  const high = serviceItems.filter(s => s.urgency === "High" && !["Resolved", "Cancelled"].includes(s.status)).length;

  return (
    <AppShell>
      <div className="page-header">
        <h1>Service</h1>
        <p>Track site visits and service calls with scheduled dates, statuses, and field notes instead of burying revisits in job comments.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Active queue</div>
          <div className="stat-value" style={{ color: high > 0 ? "var(--red)" : undefined }}>{active}</div>
          <div className="stat-detail">Needs scheduling or follow-through</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In progress</div>
          <div className="stat-value">{inProgress}</div>
          <div className="stat-detail">Active work underway</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Scheduled</div>
          <div className="stat-value">{scheduled}</div>
          <div className="stat-detail">Site visits booked</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">High urgency</div>
          <div className="stat-value" style={{ color: high > 0 ? "var(--red)" : "var(--green)" }}>{high}</div>
          <div className="stat-detail">Needs fast response</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issue, customer, site..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>
        <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
          {URGENCIES.map(u => <option key={u} value={u}>{u === "All" ? "All urgencies" : u}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
        {(search || urgencyFilter !== "All" || statusFilter !== "All") && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setUrgencyFilter("All"); setStatusFilter("All"); }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {loading ? "Loading..." : `${filtered.length} ticket${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
        {!loading && filtered.length === 0 && (
          <div className="card empty-state" style={{ gridColumn: "1 / -1" }}>No service tickets match your filters.</div>
        )}
        {loading && (
          <div className="card empty-state" style={{ gridColumn: "1 / -1" }}>Loading service tickets...</div>
        )}
        {filtered.map(item => (
          <div key={item.id} className="card" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="mono badge badge-slate">{item.id}</span>
                {item.type ? <span className={`badge ${statusBadgeClass(item.type)}`}>{item.type}</span> : null}
                <span className={`badge ${statusBadgeClass(item.urgency)}`}>{item.urgency}</span>
              </div>
              <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
            </div>

            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{item.issue}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={11} />{item.site}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Customer</div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{item.customer}</div>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Assigned</div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{item.assignedTo}</div>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Created</div>
                <div style={{ fontSize: 12 }}>{formatDate(item.createdDate)}</div>
              </div>
              <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Job</div>
                <div style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{item.jobNumber}</div>
              </div>
            </div>

            {item.notes && (
              <div style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
              }}>
                {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
