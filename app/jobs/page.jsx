"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Search, ChevronRight, AlertTriangle, FileText } from "lucide-react";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const STATUSES = [
  "created",
  "scheduled",
  "install_completed",
  "inspection_scheduled",
  "inspection_passed",
  "inspection_failed",
  "pto_submitted",
  "pto_granted",
  "m1_invoiced",
  "m1_partially_paid",
  "m1_paid",
  "m2_invoiced",
  "m2_partially_paid",
  "paid_in_full",
  "on_hold",
  "cancelled",
];

const STATUS_META = {
  created:               { bg: "#f1f5f9", color: "#334155", label: "Created" },
  scheduled:             { bg: "#dbeafe", color: "#1e3a8a", label: "Scheduled" },
  install_completed:     { bg: "#d8f3dc", color: "#1b4332", label: "Install Complete" },
  inspection_scheduled:  { bg: "#dbeafe", color: "#1e3a8a", label: "Inspection Scheduled" },
  inspection_passed:     { bg: "#d8f3dc", color: "#1b4332", label: "Inspection Passed" },
  inspection_failed:     { bg: "#fee2e2", color: "#991b1b", label: "Inspection Failed" },
  pto_submitted:         { bg: "#fef3c7", color: "#78350f", label: "PTO Submitted" },
  pto_granted:           { bg: "#dcfce7", color: "#166534", label: "PTO Granted" },
  m1_invoiced:           { bg: "#ede9fe", color: "#5b21b6", label: "M1 Invoiced" },
  m1_partially_paid:     { bg: "#fef3c7", color: "#78350f", label: "M1 Partially Paid" },
  m1_paid:               { bg: "#d8f3dc", color: "#1b4332", label: "M1 Paid" },
  m2_invoiced:           { bg: "#ede9fe", color: "#5b21b6", label: "M2 Invoiced" },
  m2_partially_paid:     { bg: "#fef3c7", color: "#78350f", label: "M2 Partially Paid" },
  paid_in_full:          { bg: "#1a1917", color: "#ffffff", label: "Paid in Full" },
  on_hold:               { bg: "#fee2e2", color: "#7f1d1d", label: "On Hold / Issue" },
  cancelled:             { bg: "#e5e7eb", color: "#4b5563", label: "Cancelled" },
};

const STAGE_META = {
  created: "Pre-Install",
  scheduled: "Installation",
  install_completed: "Post-Install",
  inspection_scheduled: "Inspections",
  inspection_passed: "Closeout",
  inspection_failed: "Issue",
  pto_submitted: "PTO",
  pto_granted: "Funding",
  m1_invoiced: "Funding",
  m1_partially_paid: "Funding",
  m1_paid: "Funding",
  m2_invoiced: "Final Billing",
  m2_partially_paid: "Final Billing",
  paid_in_full: "Completed",
  on_hold: "Issue",
  cancelled: "Cancelled",
};

const STAGE_COLORS = {
  "Pre-Install": { bg: "#f8fafc", color: "#475569" },
  "Installation": { bg: "#dbeafe", color: "#1e3a8a" },
  "Post-Install": { bg: "#dcfce7", color: "#166534" },
  "Inspections": { bg: "#fef3c7", color: "#92400e" },
  "PTO": { bg: "#ede9fe", color: "#6d28d9" },
  "Funding": { bg: "#e0f2fe", color: "#075985" },
  "Final Billing": { bg: "#fde68a", color: "#854d0e" },
  "Completed": { bg: "#1a1917", color: "#ffffff" },
  "Issue": { bg: "#fee2e2", color: "#991b1b" },
  "Cancelled": { bg: "#e5e7eb", color: "#4b5563" },
};

const STATES = ["All", "CT", "MA", "NH", "ME", "VT", "RI", "NY", "NJ"];

function FilterSelect({ value, onChange, options, placeholder }) {
  const active = value !== "All" && value !== "";
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontSize: 12,
        padding: "5px 10px",
        borderRadius: 20,
        border: active ? "1.5px solid var(--text-primary)" : "0.5px solid var(--border)",
        background: active ? "var(--text-primary)" : "var(--surface)",
        color: active ? "white" : "var(--text-secondary)",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {options.map(o => (
        <option key={o} value={o} style={{ background: "white", color: "#111" }}>
          {o === "All" ? placeholder : o}
        </option>
      ))}
    </select>
  );
}

function statusLabel(status) {
  return STATUS_META[status]?.label || status || "—";
}

function stageForJob(job) {
  return STAGE_META[job.currentStatus] || "Pre-Install";
}

function bestDate(job) {
  return Math.max(
    ...[job.installCompletedAt, job.installScheduledAt, job.ptoGrantedAt]
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .filter(n => !isNaN(n)),
    0
  );
}

function displayDate(job) {
  return formatDate(job.installCompletedAt || job.installScheduledAt || job.ptoGrantedAt || job.currentStatusChangedAt);
}

export default function JobsPage() {
  const { canSeeFinancials, loading: roleLoading } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v2/jobs")
      .then(r => r.ok ? r.json() : [])
      .then(data => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [crewFilter, setCrewFilter] = useState("All");
  const [repFilter, setRepFilter] = useState("All");
  const [period, setPeriod] = useState("All time");
  const [activeFilter, setActiveFilter] = useState("Active");
  const [stageFilter, setStageFilter] = useState("All");
  const [sort, setSort] = useState({ col: "date", dir: "desc" });

  const crewOptions = useMemo(() => {
    const all = new Set();
    jobs.forEach(j => (j.crewNames || []).forEach(c => c && all.add(c.trim())));
    return ["All", ...Array.from(all).sort()];
  }, [jobs]);

  const repOptions = useMemo(() => {
    const all = new Set();
    jobs.forEach(j => j.repName && all.add(j.repName.trim()));
    return ["All", ...Array.from(all).sort()];
  }, [jobs]);

  const stageOptions = useMemo(() => {
    return ["All", ...Array.from(new Set(jobs.map(stageForJob))).sort()];
  }, [jobs]);

  const filtered = useMemo(() => {
    const byPeriod = filterByPeriod(
      jobs.map(j => ({ ...j, createdAt: j.installScheduledAt || j.installCompletedAt || j.currentStatusChangedAt })),
      period
    );

    return byPeriod.filter((j) => {
      const matchSearch = !search.trim() || search.trim().toLowerCase().split(/\s+/).every(word => {
        const haystack = [
          j.customerName,
          j.jobNumber,
          j.address?.street1,
          j.address?.city,
          j.address?.state,
          j.repName,
          ...(j.crewNames || []),
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(word);
      });

      const matchStatus = statusFilter === "All" || j.currentStatus === statusFilter;
      const matchStage = stageFilter === "All" || stageForJob(j) === stageFilter;
      const matchState = stateFilter === "All" || j.address?.state === stateFilter;
      const matchCrew = crewFilter === "All" || (j.crewNames || []).includes(crewFilter);
      const matchRep = repFilter === "All" || j.repName === repFilter;
      const isActive = j.currentStatus !== "paid_in_full" && j.currentStatus !== "cancelled";
      const matchActive =
        activeFilter === "All" ||
        (activeFilter === "Active" && isActive) ||
        (activeFilter === "Inactive" && !isActive);

      return matchSearch && matchStatus && matchStage && matchState && matchCrew && matchRep && matchActive;
    });
  }, [jobs, search, statusFilter, stageFilter, stateFilter, crewFilter, repFilter, period, activeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      let av;
      let bv;
      if (col === "customer") { av = a.customerName || ""; bv = b.customerName || ""; }
      else if (col === "job") { av = a.jobNumber || ""; bv = b.jobNumber || ""; }
      else if (col === "status") { av = statusLabel(a.currentStatus); bv = statusLabel(b.currentStatus); }
      else if (col === "stage") { av = stageForJob(a); bv = stageForJob(b); }
      else if (col === "location") { av = `${a.address?.state || ""}${a.address?.city || ""}`; bv = `${b.address?.state || ""}${b.address?.city || ""}`; }
      else if (col === "system") {
        av = parseFloat(a.systemSizeKw) || 0;
        bv = parseFloat(b.systemSizeKw) || 0;
        return dir === "asc" ? av - bv : bv - av;
      } else if (col === "crew") { av = (a.crewNames || []).join(""); bv = (b.crewNames || []).join(""); }
      else if (col === "rep") { av = a.repName || ""; bv = b.repName || ""; }
      else if (col === "date") {
        av = bestDate(a);
        bv = bestDate(b);
        return dir === "asc" ? av - bv : bv - av;
      } else if (col === "outstanding") {
        av = a.financialSummary?.outstandingCents || 0;
        bv = b.financialSummary?.outstandingCents || 0;
        return dir === "asc" ? av - bv : bv - av;
      } else {
        av = ""; bv = "";
      }
      return dir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(col) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  }

  const hasFilters = search || statusFilter !== "All" || stageFilter !== "All" || stateFilter !== "All" || crewFilter !== "All" || repFilter !== "All";

  function clearFilters() {
    setSearch("");
    setStatusFilter("All");
    setStageFilter("All");
    setStateFilter("All");
    setCrewFilter("All");
    setRepFilter("All");
  }

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Jobs</h1>
          <p>Normalized pipeline view backed by Neon relational tables.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Link href="/invoices">
            <button className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={13} /> Invoices
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["Active", "Inactive", "All"].map(f => {
          const count = f === "All"
            ? jobs.length
            : jobs.filter(j => {
              const active = j.currentStatus !== "paid_in_full" && j.currentStatus !== "cancelled";
              return f === "Active" ? active : !active;
            }).length;
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                border: activeFilter === f ? "none" : "0.5px solid var(--border)",
                background: activeFilter === f ? (f === "Inactive" ? "#6b7280" : "var(--text-primary)") : "var(--surface)",
                color: activeFilter === f ? "white" : "var(--text-secondary)",
                fontWeight: activeFilter === f ? 600 : 400,
              }}
            >
              {f} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          onClick={() => setStatusFilter("All")}
          style={{
            padding: "5px 12px",
            borderRadius: 20,
            border: "0.5px solid var(--border)",
            background: statusFilter === "All" ? "var(--text-primary)" : "var(--surface)",
            color: statusFilter === "All" ? "white" : "var(--text-secondary)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          All ({jobs.length})
        </button>
        {STATUSES.filter(status => jobs.some(job => job.currentStatus === status)).map(status => {
          const meta = STATUS_META[status];
          const active = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(active ? "All" : status)}
              style={{
                padding: "5px 12px",
                borderRadius: 20,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontWeight: active ? 600 : 400,
                background: active ? meta.color : meta.bg,
                color: active ? "white" : meta.color,
                border: `0.5px solid ${meta.color}44`,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {status === "on_hold" && <AlertTriangle size={10} />}
              {meta.label} ({jobs.filter(job => job.currentStatus === status).length})
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customer, address, job #, rep..."
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10 }}
          />
        </div>

        <FilterSelect value={stateFilter} onChange={setStateFilter} options={STATES} placeholder="All states" />
        <FilterSelect value={stageFilter} onChange={setStageFilter} options={stageOptions} placeholder="All stages" />
        {crewOptions.length > 2 && <FilterSelect value={crewFilter} onChange={setCrewFilter} options={crewOptions} placeholder="All crew" />}
        {repOptions.length > 2 && <FilterSelect value={repFilter} onChange={setRepFilter} options={repOptions} placeholder="All reps" />}

        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 12 }}>
            Clear
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {loading || roleLoading ? "Loading..." : `${filtered.length} job${filtered.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="empty-state" style={{ padding: 40 }}>Loading jobs...</div>
        ) : sorted.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>No jobs match your filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  {[
                    ["stage", "Stage"],
                    ["customer", "Customer"],
                    ["job", "Job #"],
                    ["status", "Status"],
                    ["location", "Location"],
                    ["system", "System"],
                    ["crew", "Crew"],
                    ["rep", "Rep"],
                    ...(canSeeFinancials ? [["outstanding", "Outstanding"]] : []),
                    ["date", "Date"],
                  ].map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      style={{
                        padding: "9px 12px",
                        textAlign: "left",
                        fontWeight: 600,
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      {label}{sort.col === key ? ` ${sort.dir === "asc" ? "↑" : "↓"}` : ""}
                    </th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((job, i) => {
                  const status = STATUS_META[job.currentStatus] || STATUS_META.created;
                  const stage = stageForJob(job);
                  const stageStyle = STAGE_COLORS[stage] || STAGE_COLORS["Pre-Install"];
                  const isIssue = job.currentStatus === "on_hold" || job.currentStatus === "inspection_failed";
                  return (
                    <tr
                      key={job.id}
                      onClick={() => { window.location.href = `/jobs/${job.jobNumber}`; }}
                      style={{
                        borderBottom: "0.5px solid var(--border)",
                        background: isIssue ? "#fff8f8" : i % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: stageStyle.bg, color: stageStyle.color }}>
                          {stage}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isIssue && <AlertTriangle size={11} style={{ color: "#dc2626", flexShrink: 0 }} />}
                          {job.customerName}
                          {job.battery && <span className="badge badge-blue" style={{ fontSize: 9 }}>Battery</span>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span className="mono badge badge-slate" style={{ fontSize: 10 }}>{job.jobNumber}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{job.address?.state}{job.address?.city ? ` · ${job.address.city}` : ""}</div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{job.address?.street1 || "—"}</div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {job.panelCount ? `${job.panelCount} panels` : "—"}
                        {job.systemSizeKw ? <span style={{ color: "var(--text-tertiary)" }}> · {job.systemSizeKw} kW</span> : ""}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                        {job.crewNames?.length ? job.crewNames.join(", ") : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{job.repName || "—"}</td>
                      {canSeeFinancials && (
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontWeight: 600 }}>
                          {formatCurrency((job.financialSummary?.outstandingCents || 0) / 100)}
                        </td>
                      )}
                      <td style={{ padding: "10px 12px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {displayDate(job)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
