"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import PeriodFilter, { filterByPeriod } from "@/components/PeriodFilter";
import { Search, CalendarDays, CircleDollarSign, ClipboardList, AlertTriangle, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

const STATE_OPTIONS = ["All", "CT", "MA", "NH", "ME", "VT", "RI", "NY", "NJ"];

const STATUS_META = {
  created: { label: "Created", bg: "#f1f5f9", color: "#334155" },
  scheduled: { label: "Scheduled", bg: "#dbeafe", color: "#1d4ed8" },
  install_completed: { label: "Install complete", bg: "#dcfce7", color: "#166534" },
  inspection_scheduled: { label: "Inspection scheduled", bg: "#e0f2fe", color: "#075985" },
  inspection_passed: { label: "Inspection passed", bg: "#d1fae5", color: "#065f46" },
  inspection_failed: { label: "Inspection failed", bg: "#fee2e2", color: "#991b1b" },
  pto_submitted: { label: "PTO submitted", bg: "#fef3c7", color: "#92400e" },
  pto_granted: { label: "PTO granted", bg: "#ede9fe", color: "#6d28d9" },
  m1_invoiced: { label: "M1 invoiced", bg: "#ede9fe", color: "#6d28d9" },
  m1_partially_paid: { label: "M1 partial", bg: "#fef3c7", color: "#92400e" },
  m1_paid: { label: "M1 paid", bg: "#dcfce7", color: "#166534" },
  m2_invoiced: { label: "M2 invoiced", bg: "#ede9fe", color: "#6d28d9" },
  m2_partially_paid: { label: "M2 partial", bg: "#fef3c7", color: "#92400e" },
  paid_in_full: { label: "Paid in full", bg: "#111827", color: "#ffffff" },
  on_hold: { label: "On hold", bg: "#fee2e2", color: "#991b1b" },
  cancelled: { label: "Cancelled", bg: "#e5e7eb", color: "#4b5563" },
};

const QUEUES = [
  {
    key: "scheduled",
    title: "Scheduled installs",
    description: "Jobs that need crew attention and install execution.",
    empty: "No installs are queued here.",
    icon: CalendarDays,
    match: (job) => job.currentStatus === "scheduled",
  },
  {
    key: "m1",
    title: "Ready for M1",
    description: "Install is done and billing should move immediately.",
    empty: "Nothing is waiting on M1.",
    icon: CircleDollarSign,
    match: (job) => ["install_completed", "inspection_scheduled", "inspection_passed"].includes(job.currentStatus),
  },
  {
    key: "inspection",
    title: "Inspection queue",
    description: "Needs scheduling, follow-through, or correction.",
    empty: "No jobs are sitting in inspection.",
    icon: ClipboardList,
    match: (job) => ["inspection_scheduled", "inspection_failed"].includes(job.currentStatus),
  },
  {
    key: "m2",
    title: "Ready for M2",
    description: "PTO is granted and final billing should go out.",
    empty: "Nothing is waiting on M2.",
    icon: CircleDollarSign,
    match: (job) => ["pto_granted", "m1_paid"].includes(job.currentStatus),
  },
  {
    key: "collections",
    title: "Unpaid follow-up",
    description: "Open balances that still need collections work.",
    empty: "No unpaid jobs in this view.",
    icon: CircleDollarSign,
    match: (job) => (job.financialSummary?.outstandingCents || 0) > 0 && !["cancelled", "paid_in_full"].includes(job.currentStatus),
  },
  {
    key: "issues",
    title: "Problem jobs",
    description: "Blocked jobs that need manual ops attention.",
    empty: "No blocked jobs right now.",
    icon: AlertTriangle,
    match: (job) => ["inspection_failed", "on_hold"].includes(job.currentStatus),
  },
];

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function operationalDate(job) {
  return job.installScheduledAt || job.installCompletedAt || job.ptoGrantedAt || job.currentStatusChangedAt;
}

function nextAction(job) {
  switch (job.currentStatus) {
    case "created":
      return "Schedule install";
    case "scheduled":
      return "Confirm crew";
    case "install_completed":
      return "Create M1 invoice";
    case "inspection_scheduled":
      return "Track inspection";
    case "inspection_failed":
      return "Fix and reschedule";
    case "inspection_passed":
      return "Push PTO";
    case "pto_submitted":
      return "Watch utility PTO";
    case "pto_granted":
      return "Create M2 invoice";
    case "m1_invoiced":
    case "m1_partially_paid":
      return "Collect M1";
    case "m1_paid":
      return "Move to final billing";
    case "m2_invoiced":
    case "m2_partially_paid":
      return "Collect M2";
    case "paid_in_full":
      return "Closed";
    case "on_hold":
      return "Ops review";
    default:
      return "Review";
  }
}

function queueSort(job) {
  const parsed = operationalDate(job) ? new Date(operationalDate(job)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function addressSummary(job) {
  return [job.address?.city, job.address?.state].filter(Boolean).join(", ") || "-";
}

function QueuePanel({ queue, canSeeFinancials }) {
  const Icon = queue.icon;
  return (
    <div className="card" style={{ padding: "18px", border: "1px solid #eadfce", background: "#fffdf9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: "#f5ecdf", color: "#6c4b2e", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{queue.title}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{queue.description}</div>
          </div>
        </div>
        <div style={{ minWidth: 38, height: 38, borderRadius: 12, background: "#1f1a17", color: "white", display: "grid", placeItems: "center", fontWeight: 800 }}>
          {queue.jobs.length}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {queue.jobs.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "8px 0" }}>{queue.empty}</div>
        ) : queue.jobs.slice(0, 6).map((job) => {
          const status = statusMeta(job.currentStatus);
          return (
            <Link key={job.id} href={`/jobs/${job.jobNumber}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ border: "1px solid #efe5da", borderRadius: "var(--radius-md)", padding: "11px 12px", background: "white" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{job.customerName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {job.jobNumber} | {addressSummary(job)}
                    </div>
                  </div>
                  <span style={{ padding: "3px 8px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#5b4636" }}>
                  Next: <strong>{nextAction(job)}</strong>
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span>{formatDate(operationalDate(job))}</span>
                  <span>{canSeeFinancials ? formatCurrency((job.financialSummary?.outstandingCents || 0) / 100) : job.repName || "No rep"}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function JobsPage() {
  const { canSeeFinancials, loading: roleLoading } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("All time");
  const [stateFilter, setStateFilter] = useState("All");
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/v2/jobs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredJobs = useMemo(() => {
    const windowed = filterByPeriod(
      jobs.map((job) => ({ ...job, createdAt: operationalDate(job) })),
      period
    );

    return windowed.filter((job) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q || [
        job.customerName,
        job.jobNumber,
        job.address?.street1,
        job.address?.city,
        job.address?.state,
        job.repName,
        ...(job.crewNames || []),
      ].filter(Boolean).join(" ").toLowerCase().includes(q);

      const matchesState = stateFilter === "All" || job.address?.state === stateFilter;
      const isClosed = ["paid_in_full", "cancelled"].includes(job.currentStatus);
      return matchesSearch && matchesState && (showClosed || !isClosed);
    });
  }, [jobs, period, search, stateFilter, showClosed]);

  const queueData = useMemo(() => {
    return QUEUES.map((queue) => ({
      ...queue,
      jobs: filteredJobs.filter(queue.match).sort((a, b) => queueSort(a) - queueSort(b)),
    }));
  }, [filteredJobs]);

  const worklist = useMemo(() => {
    return [...filteredJobs].sort((a, b) => queueSort(a) - queueSort(b)).slice(0, 100);
  }, [filteredJobs]);

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Daily action board</h1>
          <p>Use the queues below to work installs, invoices, PTO, collections, and problem jobs.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Link href="/invoices">
            <button className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CircleDollarSign size={14} /> Billing
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 420 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, job number, address, rep, crew..."
            style={{ width: "100%", paddingLeft: 34, paddingRight: 12 }}
          />
        </div>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          style={{ fontSize: 13, padding: "9px 12px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          {STATE_OPTIONS.map((state) => (
            <option key={state} value={state}>
              {state === "All" ? "All states" : state}
            </option>
          ))}
        </select>

        <button
          className={showClosed ? "btn btn-primary" : "btn btn-outline"}
          onClick={() => setShowClosed((value) => !value)}
        >
          {showClosed ? "Showing closed jobs" : "Hide closed jobs"}
        </button>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
          {loading || roleLoading ? "Loading..." : `${filteredJobs.length} jobs in play`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        {queueData.map((queue) => (
          <QueuePanel key={queue.key} queue={queue} canSeeFinancials={canSeeFinancials} />
        ))}
      </div>

      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Master worklist</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Secondary scan for the full active pipeline after you clear the queue cards above.</div>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: 34 }}>Loading jobs...</div>
        ) : worklist.length === 0 ? (
          <div className="empty-state" style={{ padding: 34 }}>No jobs match the current action filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  {["Customer", "Job #", "Town", "Status", "Next step", "Date", "Outstanding", ""].map((label) => (
                    <th
                      key={label}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worklist.map((job, index) => {
                  const status = statusMeta(job.currentStatus);
                  const issue = ["inspection_failed", "on_hold"].includes(job.currentStatus);
                  return (
                    <tr
                      key={job.id}
                      onClick={() => { window.location.href = `/jobs/${job.jobNumber}`; }}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        background: issue ? "#fff7f7" : index % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                      }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {issue && <AlertTriangle size={13} style={{ color: "#dc2626", flexShrink: 0 }} />}
                          <div>
                            <div style={{ fontWeight: 700 }}>{job.customerName}</div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{job.repName || "No rep assigned"}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}><span className="mono badge badge-slate">{job.jobNumber}</span></td>
                      <td style={{ padding: "12px", color: "var(--text-secondary)" }}>{addressSummary(job)}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ padding: "4px 9px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 11, fontWeight: 700 }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px", fontWeight: 600, color: "#5b4636" }}>{nextAction(job)}</td>
                      <td style={{ padding: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{formatDate(operationalDate(job))}</td>
                      <td style={{ padding: "12px", whiteSpace: "nowrap", fontWeight: 700 }}>
                        {canSeeFinancials ? formatCurrency((job.financialSummary?.outstandingCents || 0) / 100) : ((job.financialSummary?.outstandingCents || 0) > 0 ? "Open" : "Clear")}
                      </td>
                      <td style={{ padding: "12px" }}><ChevronRight size={15} style={{ color: "var(--text-tertiary)" }} /></td>
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
