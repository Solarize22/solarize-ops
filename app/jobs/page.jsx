"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { formatCurrency, computeStage, STAGES, STAGE_COLORS } from "@/lib/utils";
import { Search, ChevronRight, Plus, AlertTriangle, Download, X } from "lucide-react";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";
import { useUserRole } from "@/lib/useUserRole";

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

function m1Due(job) {
  return job.m1Due || ["Install Complete","Inspection Scheduled","Inspection Passed","Fully Paid / Closed"].includes(job.status);
}
function m2Due(job) {
  return job.m2Due || ["Inspection Passed","Fully Paid / Closed"].includes(job.status);
}

function cardDate(job) {
  const candidates = [job.lastUpdated, job.inspectionDate, job.installDate]
    .filter(Boolean)
    .map(d => new Date(d))
    .filter(d => !isNaN(d));
  if (!candidates.length) return null;
  const latest = new Date(Math.max(...candidates));
  return latest.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bestDate(job) {
  return Math.max(
    ...[job.lastUpdated, job.inspectionDate, job.installDate]
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .filter(n => !isNaN(n)),
    0
  );
}

const STATES = ["All", "CT", "MA", "NH", "ME", "VT", "RI", "NY", "NJ"];
const M1_OPTIONS = ["All", "M1 Paid", "M1 Pending", "M1 Missing"];
const M2_OPTIONS = ["All", "M2 Paid", "M2 Pending", "M2 Missing"];

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

export default function JobsPage() {
  const { canSeeFinancials, loading: roleLoading } = useUserRole();
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setJobs(data); })
      .catch(() => {});
  }, []);

  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stateFilter, setStateFilter]   = useState("All");
  const [m1Filter, setM1Filter]         = useState("All");
  const [m2Filter, setM2Filter]         = useState("All");
  const [crewFilter, setCrewFilter]     = useState("All");
  const [repFilter, setRepFilter]       = useState("All");
  const [period, setPeriod]             = useState("All time");
  const [activeFilter, setActiveFilter] = useState("Active");
  const [stageFilter, setStageFilter]   = useState("All");
  const [sort, setSort]                 = useState({ col: "date", dir: "desc" });
  const baseColumns = [
    { key: "stage",    label: "Stage" },
    { key: "customer", label: "Customer" },
    { key: "id",       label: "Job #" },
    { key: "status",   label: "Status" },
    { key: "location", label: "Location" },
    { key: "system",   label: "System" },
    { key: "crew",     label: "Crew" },
    { key: "rep",      label: "Rep" },
    { key: "m1m2",     label: "M1 / M2", noSort: true, ownerOnly: true },
    { key: "date",     label: "Date" },
    { key: "next",     label: "Next action", noSort: true },
  ];

  const [columns, setColumns] = useState(baseColumns);

  // Update columns when role loads
  useEffect(() => {
    if (roleLoading) return;
    setColumns(baseColumns.filter(c => !c.ownerOnly || canSeeFinancials));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeeFinancials, roleLoading]);
  const dragCol = useRef(null);

  // Derived filter options from actual job data
  const crewOptions = useMemo(() => {
    const all = new Set();
    jobs.forEach(j => (j.crew || []).forEach(c => c && all.add(c.trim())));
    return ["All", ...Array.from(all).sort()];
  }, [jobs]);

  const repOptions = useMemo(() => {
    const all = new Set();
    jobs.forEach(j => j.rep && all.add(j.rep.trim()));
    return ["All", ...Array.from(all).sort()];
  }, [jobs]);

  const filtered = useMemo(() => {
    const byPeriod = filterByPeriod(jobs, period);
    return byPeriod.filter(j => {
      // Search: split by spaces, each word must match at least one field
      const matchSearch = !search.trim() || search.trim().toLowerCase().split(/\s+/).every(word => {
        const haystack = [j.customer, j.id, j.street, j.city, j.state, j.zip, j.rep, ...(j.crew || [])]
          .filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(word);
      });

      const matchStatus = statusFilter === "All" || j.status === statusFilter;
      const matchStage  = stageFilter === "All" || computeStage(j) === stageFilter;
      const matchState  = stateFilter === "All" || j.state === stateFilter;
      const matchCrew   = crewFilter === "All" || (j.crew || []).includes(crewFilter);
      const matchRep    = repFilter === "All" || j.rep === repFilter;

      // M1 filter
      const jM1Due = m1Due(j);
      const matchM1 =
        m1Filter === "All"        ? true :
        m1Filter === "M1 Paid"    ? (jM1Due && j.m1Received) :
        m1Filter === "M1 Pending" ? (jM1Due && !j.m1Received) :
        m1Filter === "M1 Missing" ? !jM1Due : true;

      // M2 filter
      const jM2Due = m2Due(j);
      const matchM2 =
        m2Filter === "All"        ? true :
        m2Filter === "M2 Paid"    ? (jM2Due && j.m2Received) :
        m2Filter === "M2 Pending" ? (jM2Due && !j.m2Received) :
        m2Filter === "M2 Missing" ? !jM2Due : true;

      const bothPaid = j.m1Received && j.m2Received;
      const isActive = j.active !== false && j.status !== "Fully Paid / Closed" && !bothPaid;
      const matchActive =
        activeFilter === "All" ||
        (activeFilter === "Active" && isActive) ||
        (activeFilter === "Inactive" && !isActive);

      return matchSearch && matchStatus && matchStage && matchState && matchCrew && matchRep && matchM1 && matchM2 && matchActive;
    });
  }, [jobs, search, statusFilter, stageFilter, stateFilter, crewFilter, repFilter, m1Filter, m2Filter, period, activeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { col, dir } = sort;
    arr.sort((a, b) => {
      let av, bv;
      if (col === "customer") { av = a.customer || ""; bv = b.customer || ""; }
      else if (col === "id")   { av = a.id || ""; bv = b.id || ""; }
      else if (col === "status") { av = a.status || ""; bv = b.status || ""; }
      else if (col === "location") { av = (a.state || "") + (a.city || ""); bv = (b.state || "") + (b.city || ""); }
      else if (col === "system") { av = parseFloat(a.systemSize) || 0; bv = parseFloat(b.systemSize) || 0; return dir === "asc" ? av - bv : bv - av; }
      else if (col === "crew") { av = (a.crew || []).join(""); bv = (b.crew || []).join(""); }
      else if (col === "rep")  { av = a.rep || ""; bv = b.rep || ""; }
      else if (col === "stage") {
        const order = STAGES.reduce((acc, s, i) => { acc[s] = i; return acc; }, {});
        av = order[computeStage(a)] ?? 99; bv = order[computeStage(b)] ?? 99;
        return dir === "asc" ? av - bv : bv - av;
      }
      else if (col === "date") {
        av = bestDate(a); bv = bestDate(b);
        return dir === "asc" ? av - bv : bv - av;
      }
      else { av = ""; bv = ""; }
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [filtered, sort]);

  function toggleSort(col) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  }

  const hasFilters = search || statusFilter !== "All" || stageFilter !== "All" || stateFilter !== "All" ||
    crewFilter !== "All" || repFilter !== "All" ||
    (canSeeFinancials && (m1Filter !== "All" || m2Filter !== "All"));

  function clearFilters() {
    setSearch(""); setStatusFilter("All"); setStageFilter("All"); setStateFilter("All");
    setCrewFilter("All"); setRepFilter("All"); setM1Filter("All"); setM2Filter("All");
  }

  function downloadCSV() {
    const headers = [
      "Job #","Customer","Status","Stage","Street","City","State","Zip",
      "System Size (kW)","Panels","Watt/Panel","Inverter","Battery",
      "Crew","Rep","Financer","Contract Amount","Install Cost",
      "M1 Due","M1 Received","M2 Due","M2 Received",
      "Install Date","Inspection Date","Permit Status","Interconnection Status",
      "Invoice #","Next Action","Notes",
    ];
    const escape = v => {
      const s = v === null || v === undefined ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const rows = sorted.map(j => [
      j.id, j.customer, j.status, computeStage(j), j.street, j.city, j.state, j.zip,
      j.systemSize, j.panelCount||"", j.watt||"", j.inverter, j.battery?"Yes":"No",
      (j.crew||[]).join("; "), j.rep, j.financer, j.contractAmount||"", j.installCost||"",
      j.m1Due?"Yes":"No", j.m1Received?"Yes":"No",
      j.m2Due?"Yes":"No", j.m2Received?"Yes":"No",
      j.installDate, j.inspectionDate, j.permitStatus, j.interconnectionStatus,
      j.invoiceNumber, j.nextAction, j.notes,
    ].map(escape).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `solarize-jobs-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function updateStatus(jobId, newStatus) {
    const updates = { status: newStatus, lastUpdated: new Date().toISOString() };
    if (newStatus === "Install Complete") updates.m1Due = true;
    if (newStatus === "Inspection Passed") { updates.m1Due = true; updates.m2Due = true; }
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...updates } : j));
    fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: jobId, updates }),
    }).catch(() => {});
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
          <button className="btn btn-ghost" onClick={downloadCSV} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Download size={13} /> Export CSV
          </button>
          <Link href="/jobs/new">
            <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={13} /> New job
            </button>
          </Link>
        </div>
      </div>

      {/* Active / Inactive toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {["Active","Inactive","All"].map(f => {
          const count = f === "All" ? jobs.length : jobs.filter(j => {
            const bothPaid = j.m1Received && j.m2Received;
            const active = j.active !== false && j.status !== "Fully Paid / Closed" && !bothPaid;
            return f === "Active" ? active : !active;
          }).length;
          return (
            <button key={f} onClick={() => setActiveFilter(f)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)",
              border: activeFilter === f ? "none" : "0.5px solid var(--border)",
              background: activeFilter === f ? (f === "Inactive" ? "#6b7280" : "var(--text-primary)") : "var(--surface)",
              color: activeFilter === f ? "white" : "var(--text-secondary)",
              fontWeight: activeFilter === f ? 600 : 400,
            }}>
              {f} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Status chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setStatusFilter("All")} style={{
          padding: "5px 12px", borderRadius: 20, border: "0.5px solid var(--border)",
          background: statusFilter === "All" ? "var(--text-primary)" : "var(--surface)",
          color: statusFilter === "All" ? "white" : "var(--text-secondary)",
          fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)",
        }}>
          All ({jobs.length})
        </button>
        {STATUSES.filter(s => counts[s] > 0).map(s => {
          const sc = STATUS_COLORS[s];
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(active ? "All" : s)} style={{
              padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              fontFamily: "var(--font-body)", fontWeight: active ? 600 : 400,
              background: active ? sc.color : sc.bg, color: active ? "white" : sc.color,
              border: `0.5px solid ${sc.color}44`, display: "flex", alignItems: "center", gap: 5,
            }}>
              {s === "Rescheduled / Issue" && <AlertTriangle size={10} />}
              {s} ({counts[s]})
            </button>
          );
        })}
      </div>

      {/* Search + filters row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, address, job #, rep..."
            style={{ width: "100%", paddingLeft: 30, paddingRight: search ? 28 : 10 }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "flex" }}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* State */}
        <FilterSelect value={stateFilter} onChange={setStateFilter} options={STATES} placeholder="All states" />

        {/* Stage */}
        <FilterSelect value={stageFilter} onChange={setStageFilter} options={["All", ...STAGES]} placeholder="All stages" />

        {/* Crew */}
        {crewOptions.length > 2 && (
          <FilterSelect value={crewFilter} onChange={setCrewFilter} options={crewOptions} placeholder="All crew" />
        )}

        {/* Rep */}
        {repOptions.length > 2 && (
          <FilterSelect value={repFilter} onChange={setRepFilter} options={repOptions} placeholder="All reps" />
        )}

        {/* M1 — owner only */}
        {canSeeFinancials && (
          <FilterSelect value={m1Filter} onChange={setM1Filter} options={M1_OPTIONS} placeholder="M1: All" />
        )}

        {/* M2 — owner only */}
        {canSeeFinancials && (
          <FilterSelect value={m2Filter} onChange={setM2Filter} options={M2_OPTIONS} placeholder="M2: All" />
        )}

        {/* Clear */}
        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <X size={11} /> Clear
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filtered.length} job{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Jobs table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>No jobs match your filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  {columns.map(({ key, label, noSort }, idx) => (
                    <th
                      key={key}
                      draggable
                      onDragStart={() => { dragCol.current = idx; }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        const from = dragCol.current;
                        if (from === null || from === idx) return;
                        setColumns(prev => {
                          const next = [...prev];
                          const [moved] = next.splice(from, 1);
                          next.splice(idx, 0, moved);
                          return next;
                        });
                        dragCol.current = null;
                      }}
                      onClick={noSort ? undefined : () => toggleSort(key)}
                      style={{
                        padding: "9px 12px", textAlign: "left", fontWeight: 600,
                        fontSize: 11, color: "var(--text-secondary)", letterSpacing: ".04em",
                        textTransform: "uppercase", whiteSpace: "nowrap",
                        cursor: "grab", userSelect: "none",
                      }}
                    >
                      <span style={{ cursor: noSort ? "grab" : "pointer" }}>
                        {label}
                        {!noSort && sort.col === key && (
                          <span style={{ marginLeft: 4 }}>{sort.dir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </span>
                    </th>
                  ))}
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((job, i) => {
                  const sc = STATUS_COLORS[job.status] || { bg: "#f1f5f9", color: "#334155" };
                  const isIssue = job.status === "Rescheduled / Issue";
                  const jM1Due = m1Due(job);
                  const jM2Due = m2Due(job);
                  const date = cardDate(job);
                  return (
                    <tr
                      key={job.id}
                      onClick={() => window.location.href = `/jobs/${job.id}`}
                      style={{
                        borderBottom: "0.5px solid var(--border)",
                        background: isIssue ? "#fff8f8" : i % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = isIssue ? "#fff8f8" : i % 2 === 0 ? "var(--surface)" : "var(--surface-2)"}
                    >
                      {columns.map(({ key }, colIdx) => {
                        if (key === "customer") return (
                          <td key={colIdx} style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {isIssue && <AlertTriangle size={11} style={{ color: "#dc2626", flexShrink: 0 }} />}
                              {job.customer}
                              {job.battery && <span className="badge badge-blue" style={{ fontSize: 9 }}>Battery</span>}
                            </div>
                          </td>
                        );
                        if (key === "id") return (
                          <td key={colIdx} style={{ padding: "10px 12px" }}>
                            <span className="mono badge badge-slate" style={{ fontSize: 10 }}>{job.id}</span>
                          </td>
                        );
                        if (key === "status") return (
                          <td key={colIdx} style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                            <select value={job.status} onChange={e => updateStatus(job.id, e.target.value)} style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: `0.5px solid ${sc.color}55`, background: sc.bg, color: sc.color, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                        );
                        if (key === "stage") {
                          const s = computeStage(job);
                          const sgc = STAGE_COLORS[s] || { bg: "#f1f5f9", color: "#334155" };
                          return (
                            <td key={colIdx} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: sgc.bg, color: sgc.color }}>{s}</span>
                            </td>
                          );
                        }
                        if (key === "location") return (
                          <td key={colIdx} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{job.state}{job.city ? ` · ${job.city}` : ""}</div>
                            <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{job.street}</div>
                          </td>
                        );
                        if (key === "system") return (
                          <td key={colIdx} style={{ padding: "10px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                            {job.panelCount > 0 ? `${job.panelCount} panels` : "—"}
                            {job.systemSize ? <span style={{ color: "var(--text-tertiary)" }}> · {job.systemSize} kW</span> : ""}
                          </td>
                        );
                        if (key === "crew") return (
                          <td key={colIdx} style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                            {job.crew?.length > 0 ? job.crew.join(", ") : "—"}
                          </td>
                        );
                        if (key === "rep") return (
                          <td key={colIdx} style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{job.rep || "—"}</td>
                        );
                        if (key === "m1m2") return (
                          <td key={colIdx} style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", gap: 4 }}>
                              {jM1Due && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: job.m1Received ? "#d8f3dc" : "#fef3c7", color: job.m1Received ? "#1b4332" : "#78350f" }}>M1 {job.m1Received ? "✓" : "due"}</span>}
                              {jM2Due && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: job.m2Received ? "#d8f3dc" : "#fef3c7", color: job.m2Received ? "#1b4332" : "#78350f" }}>M2 {job.m2Received ? "✓" : "due"}</span>}
                              {!jM1Due && !jM2Due && <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                            </div>
                          </td>
                        );
                        if (key === "date") return (
                          <td key={colIdx} style={{ padding: "10px 12px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{date || "—"}</td>
                        );
                        if (key === "next") return (
                          <td key={colIdx} style={{ padding: "10px 12px", color: isIssue ? "#dc2626" : "var(--text-secondary)", maxWidth: 200 }}>
                            {job.nextAction ? `→ ${job.nextAction}` : "—"}
                          </td>
                        );
                        return null;
                      })}
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
