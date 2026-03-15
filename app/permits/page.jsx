"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { useAllJobs, jobsToPermits } from "@/lib/useAllJobs";
import { statusBadgeClass, formatDate } from "@/lib/utils";
import { Search } from "lucide-react";

const STATUSES = ["All", "Approved", "Submitted", "In Review", "Utility Redesign Needed", "Not Submitted"];

export default function PermitsPage() {
  const allJobs = useAllJobs();
  const permits = useMemo(() => jobsToPermits(allJobs), [allJobs]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    return permits.filter(p => {
      const text = [p.customer, p.town, p.ahj, p.status, p.jobId].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  const approved = permits.filter(p => p.status === "Approved").length;
  const needsAction = permits.filter(p => ["In Review", "Utility Redesign Needed", "Not Submitted"].includes(p.status)).length;
  const submitted = permits.filter(p => p.status === "Submitted").length;

  return (
    <AppShell>
      <div className="page-header">
        <h1>Permits</h1>
        <p>Town permit progress, AHJ notes, and utility redesign tracking.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{approved}</div>
          <div className="stat-detail">Ready to inspect or PTO</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Submitted</div>
          <div className="stat-value" style={{ color: "var(--blue)" }}>{submitted}</div>
          <div className="stat-detail">Awaiting town response</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs action</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{needsAction}</div>
          <div className="stat-detail">Review, redesign, or submission</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total permits</div>
          <div className="stat-value">{permits.length}</div>
          <div className="stat-detail">Across all active jobs</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, town, AHJ..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ minWidth: 200 }}>
          {STATUSES.map(s => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
        {(search || statusFilter !== "All") && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setStatusFilter("All"); }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filtered.length} permit{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Permit ID</th>
                <th>Customer</th>
                <th>Job ID</th>
                <th>Town / AHJ</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Approved</th>
                <th>Method</th>
                <th>Next action</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="empty-state">No permits match your filters.</td></tr>
              )}
              {filtered.map(p => (
                <tr key={p.id}>
                  <td><span className="mono badge badge-slate">{p.id}</span></td>
                  <td style={{ fontWeight: 500 }}>{p.customer}</td>
                  <td><span className="mono badge badge-slate">{p.jobId}</span></td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{p.town}</div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.ahj}</div>
                  </td>
                  <td><span className={`badge ${statusBadgeClass(p.status)}`}>{p.status}</span></td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{formatDate(p.submittedDate)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{formatDate(p.approvedDate)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{p.submissionMethod}</td>
                  <td style={{ fontWeight: 500, fontSize: 12 }}>{p.nextAction}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12, maxWidth: 200 }}>{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
