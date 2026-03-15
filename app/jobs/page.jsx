"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { jobs as staticJobs } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { Search, ChevronRight, Plus } from "lucide-react";

const STATUSES = [
  "Review",
  "Scheduled",
  "In Progress",
  "Install Complete",
  "Inspection Scheduled",
  "Inspection Passed",
  "Inspection Failed",
  "Service Call",
  "Site Visit",
];

const STATUS_COLORS = {
  "Review":               { bg: "#f1f5f9", color: "#334155" },
  "Scheduled":            { bg: "#dbeafe", color: "#1e3a8a" },
  "In Progress":          { bg: "#fef3c7", color: "#78350f" },
  "Install Complete":     { bg: "#d8f3dc", color: "#1b4332" },
  "Inspection Scheduled": { bg: "#dbeafe", color: "#1e3a8a" },
  "Inspection Passed":    { bg: "#d8f3dc", color: "#1b4332" },
  "Inspection Failed":    { bg: "#fee2e2", color: "#7f1d1d" },
  "Service Call":         { bg: "#fee2e2", color: "#7f1d1d" },
  "Site Visit":           { bg: "#fef3c7", color: "#78350f" },
};

const STAGE_MAP = {
  "Review": 10,
  "Scheduled": 25,
  "In Progress": 45,
  "Install Complete": 60,
  "Inspection Scheduled": 70,
  "Inspection Passed": 90,
  "Inspection Failed": 65,
  "Service Call": 60,
  "Site Visit": 15,
};

const STATES = ["All", "CT", "MA", "NH", "ME", "VT", "RI"];

export default function JobsPage() {
  const [jobs, setJobs] = useState(() => {
    let all = [...staticJobs];
    if (typeof window !== "undefined") {
      try {
        const imported = JSON.parse(sessionStorage.getItem("importedJobs") || "[]");
        imported.forEach(j => { if (!all.find(x => x.id === j.id)) all.push(j); });
      } catch(e) {}
    }
    return all;
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const text = [j.customer, j.id, j.street, j.city, j.state, j.status].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || j.status === statusFilter;
      const matchState = stateFilter === "All" || j.state === stateFilter;
      return matchSearch && matchStatus && matchState;
    });
  }, [jobs, search, statusFilter, stateFilter]);

  function updateStatus(jobId, newStatus) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
  }

  // Status counts for chips
  const counts = {};
  STATUSES.forEach(s => { counts[s] = jobs.filter(j => j.status === s).length; });

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Jobs</h1>
          <p>Click a job to open · update status inline</p>
        </div>
        <Link href="/jobs/new">
          <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> New job
          </button>
        </Link>
      </div>

      {/* Status chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          onClick={() => setStatusFilter("All")}
          style={{
            padding: "5px 12px", borderRadius: 20, border: "0.5px solid var(--border)",
            background: statusFilter === "All" ? "var(--text-primary)" : "var(--surface)",
            color: statusFilter === "All" ? "white" : "var(--text-secondary)",
            fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)",
          }}
        >
          All ({jobs.length})
        </button>
        {STATUSES.filter(s => counts[s] > 0).map(s => {
          const sc = STATUS_COLORS[s];
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? "All" : s)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                fontFamily: "var(--font-body)", fontWeight: active ? 600 : 400,
                background: active ? sc.color : sc.bg,
                color: active ? "white" : sc.color,
                border: `0.5px solid ${sc.color}44`,
              }}
            >
              {s} ({counts[s]})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, address, job #..."
            style={{ width: "100%", paddingLeft: 30 }}
          />
        </div>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          {STATES.map(s => <option key={s} value={s}>{s === "All" ? "All states" : s}</option>)}
        </select>
        {(search || statusFilter !== "All" || stateFilter !== "All") && (
          <button className="btn btn-ghost" onClick={() => { setSearch(""); setStatusFilter("All"); setStateFilter("All"); }}>Clear</button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filtered.length} job{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Job cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div className="card empty-state">No jobs match your filters.</div>
        )}
        {filtered.map(job => {
          const sc = STATUS_COLORS[job.status] || { bg: "#f1f5f9", color: "#334155" };
          const stage = STAGE_MAP[job.status] || 0;
          return (
            <div key={job.id} className="card" style={{ padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
                {/* Left — main info */}
                <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>{job.customer}</span>
                    <span className="mono badge badge-slate">{job.id}</span>
                    {job.contractor && (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500 }}>
                        {job.contractor}
                      </span>
                    )}
                    {job.battery && <span className="badge badge-blue">Battery</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>{job.state} · {job.street}, {job.city}</span>
                    {job.panelCount > 0 && <span>{job.panelCount} panels</span>}
                  </div>
                </Link>

                {/* Right — progress + status dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <div style={{ minWidth: 100 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>
                      <span>Progress</span><span>{stage}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${stage}%` }} />
                    </div>
                  </div>

                  {/* Inline status dropdown */}
                  <select
                    value={job.status}
                    onChange={e => { e.stopPropagation(); updateStatus(job.id, e.target.value); }}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 20,
                      border: `0.5px solid ${sc.color}55`,
                      background: sc.bg,
                      color: sc.color,
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      minWidth: 120,
                    }}
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>

                  <Link href={`/jobs/${job.id}`}>
                    <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                  </Link>
                </div>
              </div>

              {job.nextAction && (
                <div style={{
                  marginTop: 8, fontSize: 12, color: "var(--text-secondary)",
                  background: "var(--surface-2)", borderRadius: "var(--radius-sm)",
                  padding: "4px 10px", display: "inline-block",
                }}>
                  → {job.nextAction}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
