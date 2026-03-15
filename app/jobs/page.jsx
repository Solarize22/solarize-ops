"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { jobs as staticJobs } from "@/lib/data";
import { formatCurrency } from "@/lib/utils";
import { Search, ChevronRight, Plus, AlertTriangle } from "lucide-react";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";

const STATUSES = [
  "Scheduled",
  "Install Complete",
  "Inspection Scheduled",
  "Inspection Passed",
  "Fully Paid / Closed",
  "Rescheduled / Issue",
];

const STATUS_COLORS = {
  "Scheduled":             { bg: "#dbeafe", color: "#1e3a8a" },
  "Install Complete":      { bg: "#d8f3dc", color: "#1b4332" },
  "Inspection Scheduled":  { bg: "#dbeafe", color: "#1e3a8a" },
  "Inspection Passed":     { bg: "#d8f3dc", color: "#1b4332" },
  "Fully Paid / Closed":   { bg: "#1a1917", color: "#ffffff" },
  "Rescheduled / Issue":   { bg: "#fee2e2", color: "#7f1d1d" },
};

const STAGE_MAP = {
  "Scheduled":             20,
  "Install Complete":      40,
  "Inspection Scheduled":  60,
  "Inspection Passed":     80,
  "Fully Paid / Closed":   100,
  "Rescheduled / Issue":   50,
};

// M1 is due once install has been marked complete (at any point)
function m1Due(job) {
  return job.m1Due || ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
}
function m2Due(job) {
  return job.m2Due || ["Inspection Passed","Fully Paid / Closed"].includes(job.status);
}

const STATES = ["All", "CT", "MA", "NH", "ME", "VT", "RI"];

export default function JobsPage() {
  const [jobs, setJobs] = useState(staticJobs);

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(imported => {
        if (imported.length > 0) {
          setJobs(prev => {
            const ids = new Set(prev.map(j => j.id));
            return [...prev, ...imported.filter(j => !ids.has(j.id))];
          });
        }
      })
      .catch(() => {});
  }, []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [period, setPeriod] = useState("All time");

  const filtered = useMemo(() => {
    const byPeriod = filterByPeriod(jobs, period);
    return byPeriod.filter(j => {
      const text = [j.customer, j.id, j.street, j.city, j.state, j.status].join(" ").toLowerCase();
      const matchSearch = text.includes(search.toLowerCase());
      const matchStatus = statusFilter === "All" || j.status === statusFilter;
      const matchState = stateFilter === "All" || j.state === stateFilter;
      return matchSearch && matchStatus && matchState;
    });
  }, [jobs, search, statusFilter, stateFilter, period]);

  function updateStatus(jobId, newStatus) {
    setJobs(prev => prev.map(j => {
      if (j.id !== jobId) return j;
      const updates = { status: newStatus };
      if (newStatus === "Install Complete") updates.m1Due = true;
      if (newStatus === "Inspection Passed") { updates.m1Due = true; updates.m2Due = true; }
      return { ...j, ...updates };
    }));
  }

  const counts = {};
  STATUSES.forEach(s => { counts[s] = filtered.filter(j => j.status === s).length; });

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Jobs</h1>
          <p>Click a job to open · update status inline</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Link href="/jobs/new">
            <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> New job
            </button>
          </Link>
        </div>
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
                display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {s === "Rescheduled / Issue" && <AlertTriangle size={10} />}
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
          const isIssue = job.status === "Rescheduled / Issue";
          const m1 = m1Due(job);
          const m2 = m2Due(job);

          return (
            <div
              key={job.id}
              className="card"
              style={{
                padding: "14px 18px",
                borderColor: isIssue ? "#fca5a5" : undefined,
                background: isIssue ? "#fff8f8" : undefined,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
                {/* Left */}
                <Link href={`/jobs/${job.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                    {isIssue && <AlertTriangle size={13} style={{ color: "#dc2626", flexShrink: 0 }} />}
                    <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-primary)" }}>{job.customer}</span>
                    <span className="mono badge badge-slate">{job.id}</span>
                    {job.battery && <span className="badge badge-blue">Battery</span>}
                    {/* M1/M2 payment badges */}
                    {m1 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
                        background: job.m1Received ? "#d8f3dc" : "#fef3c7",
                        color: job.m1Received ? "#1b4332" : "#78350f",
                        letterSpacing: "0.03em",
                      }}>
                        M1 {job.m1Received ? "✓" : "due"}
                      </span>
                    )}
                    {m2 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
                        background: job.m2Received ? "#d8f3dc" : "#fef3c7",
                        color: job.m2Received ? "#1b4332" : "#78350f",
                        letterSpacing: "0.03em",
                      }}>
                        M2 {job.m2Received ? "✓" : "due"}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>{job.state} · {job.street}, {job.city}</span>
                    {job.panelCount > 0 && <span>{job.panelCount} panels · {job.systemSize} kW</span>}
                    {job.crew?.length > 0 && <span>Crew: {job.crew.join(", ")}</span>}
                  </div>
                </Link>

                {/* Right — progress + status dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <div style={{ minWidth: 100 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>
                      <span>Progress</span><span>{stage}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${stage}%`, background: isIssue ? "#dc2626" : undefined }} />
                    </div>
                  </div>

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
                      minWidth: 140,
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
                  marginTop: 8, fontSize: 12, color: isIssue ? "#dc2626" : "var(--text-secondary)",
                  background: isIssue ? "#fee2e2" : "var(--surface-2)", borderRadius: "var(--radius-sm)",
                  padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {isIssue && <AlertTriangle size={11} />}
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
