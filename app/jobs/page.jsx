"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { CalendarDays, CircleDollarSign, ClipboardList, AlertTriangle, ChevronRight, Search, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency, formatDate, getJobSortTime, getJobWorkflowDate } from "@/lib/utils";
import { useUserRole } from "@/lib/useUserRole";

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

const JOBS_WORKLIST_COLUMNS_KEY = "jobs-worklist-columns-v1";
const JOBS_WORKLIST_SORT_KEY = "jobs-worklist-sort-v1";

const DEFAULT_VISIBLE_COLUMNS = {
  installScheduledDate: false,
  installCompletedDate: false,
  inspectionDate: false,
  systemSize: false,
  panels: false,
  module: false,
  inverter: false,
  battery: false,
  status: true,
  nextStep: true,
  workflowDate: true,
  rep: false,
  outstanding: false,
};

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
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
  return getJobSortTime(job);
}

function getInspectionDate(job) {
  return job.inspectionCompletedAt || job.inspectionScheduledAt || null;
}

function getFullAddress(job) {
  return [
    job.address?.street1,
    job.address?.street2,
    job.address?.city,
    job.address?.state,
    job.address?.postalCode,
  ].filter(Boolean).join(", ") || "-";
}

function compareValues(left, right, direction = "asc") {
  const multiplier = direction === "desc" ? -1 : 1;

  if (left === right) return 0;
  if (left === null || left === undefined || left === "") return 1;
  if (right === null || right === undefined || right === "") return -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * multiplier;
  }

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
}

function getSortValue(job, key) {
  switch (key) {
    case "jobNumber":
      return job.jobNumber || "";
    case "customer":
      return job.customerName || "";
    case "fullAddress":
      return getFullAddress(job);
    case "installScheduledDate":
      return job.installScheduledAt ? new Date(job.installScheduledAt).getTime() : null;
    case "installCompletedDate":
      return job.installCompletedAt ? new Date(job.installCompletedAt).getTime() : null;
    case "inspectionDate": {
      const inspectionDate = getInspectionDate(job);
      return inspectionDate ? new Date(inspectionDate).getTime() : null;
    }
    case "systemSize":
      return job.systemSizeKw ?? null;
    case "panels":
      return job.panelCount ?? null;
    case "module":
      return job.module || "";
    case "inverter":
      return job.inverter || "";
    case "battery":
      return job.battery ? "Yes" : "No";
    case "status":
      return statusMeta(job.currentStatus).label;
    case "nextStep":
      return nextAction(job);
    case "workflowDate":
      return queueSort(job);
    case "rep":
      return job.repName || "";
    case "outstanding":
      return job.financialSummary?.outstandingCents ?? null;
    default:
      return null;
  }
}

function cellStyle(overrides = {}) {
  return {
    padding: "10px 12px",
    verticalAlign: "middle",
    ...overrides,
  };
}

function matchesWorklistSearch(job, searchTerm) {
  if (!searchTerm) return true;

  const haystack = [
    job.jobNumber,
    job.customerName,
    job.repName,
    getFullAddress(job),
    job.address?.city,
    job.address?.state,
    job.address?.postalCode,
    job.module,
    job.inverter,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchTerm);
}

export default function JobsPage() {
  const { canSeeFinancials, loading: roleLoading } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeQueueKey, setActiveQueueKey] = useState("all");
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortState, setSortState] = useState({ key: "workflowDate", direction: "asc" });
  const [visibleColumns, setVisibleColumns] = useState({
    ...DEFAULT_VISIBLE_COLUMNS,
    outstanding: canSeeFinancials,
  });

  useEffect(() => {
    setLoading(true);
    fetch("/api/v2/jobs")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const savedColumns = window.localStorage.getItem(JOBS_WORKLIST_COLUMNS_KEY);
      if (savedColumns) {
        const parsedColumns = JSON.parse(savedColumns);
        if (parsedColumns && typeof parsedColumns === "object") {
          setVisibleColumns((current) => ({
            ...current,
            ...DEFAULT_VISIBLE_COLUMNS,
            ...parsedColumns,
          }));
        }
      }

      const savedSort = window.localStorage.getItem(JOBS_WORKLIST_SORT_KEY);
      if (savedSort) {
        const parsedSort = JSON.parse(savedSort);
        if (
          parsedSort &&
          typeof parsedSort === "object" &&
          typeof parsedSort.key === "string" &&
          ["asc", "desc"].includes(parsedSort.direction)
        ) {
          setSortState({
            key: parsedSort.key,
            direction: parsedSort.direction,
          });
        }
      }
    } catch {
      // Ignore malformed saved preferences and fall back to defaults.
    } finally {
      setPreferencesReady(true);
    }
  }, []);

  const activeJobs = useMemo(() => {
    return jobs.filter((job) => !["paid_in_full", "cancelled"].includes(job.currentStatus));
  }, [jobs]);

  const queueData = useMemo(() => {
    const visibleQueues = canSeeFinancials
      ? QUEUES
      : QUEUES.filter((queue) => !["m1", "m2", "collections"].includes(queue.key));

    return visibleQueues.map((queue) => ({
      ...queue,
      jobs: activeJobs.filter(queue.match).sort((a, b) => queueSort(a) - queueSort(b)),
    }));
  }, [activeJobs, canSeeFinancials]);

  const activeQueue = useMemo(() => {
    return queueData.find((queue) => queue.key === activeQueueKey) || null;
  }, [queueData, activeQueueKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const requestedScope = params.get("scope");
    const requestedQueue = params.get("queue");
    const visibleQueueKeys = new Set(queueData.map((queue) => queue.key));

    if (requestedScope === "all") {
      setActiveQueueKey("all");
      setShowAllJobs(true);
      return;
    }

    if (requestedQueue && visibleQueueKeys.has(requestedQueue)) {
      setActiveQueueKey(requestedQueue);
      setShowAllJobs(false);
      return;
    }

    setActiveQueueKey("all");
    setShowAllJobs(false);
  }, [queueData]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const worklist = useMemo(() => {
    const sourceJobs = activeQueue ? activeQueue.jobs : showAllJobs ? jobs : activeJobs;
    const filteredJobs = sourceJobs.filter((job) => matchesWorklistSearch(job, normalizedSearchTerm));
    const sortedJobs = [...filteredJobs].sort((a, b) => {
      const primary = compareValues(getSortValue(a, sortState.key), getSortValue(b, sortState.key), sortState.direction);
      if (primary !== 0) return primary;
      return queueSort(a) - queueSort(b);
    });

    return sortedJobs.slice(0, 100);
  }, [activeJobs, activeQueue, jobs, normalizedSearchTerm, showAllJobs, sortState]);

  useEffect(() => {
    setVisibleColumns((current) => ({
      ...current,
      outstanding: canSeeFinancials ? current.outstanding : false,
    }));
  }, [canSeeFinancials]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") return;
    window.localStorage.setItem(JOBS_WORKLIST_COLUMNS_KEY, JSON.stringify(visibleColumns));
  }, [preferencesReady, visibleColumns]);

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") return;
    window.localStorage.setItem(JOBS_WORKLIST_SORT_KEY, JSON.stringify(sortState));
  }, [preferencesReady, sortState]);

  const optionalColumns = [
    { key: "installScheduledDate", label: "Install scheduled" },
    { key: "installCompletedDate", label: "Install completed" },
    { key: "inspectionDate", label: "Inspection date" },
    { key: "systemSize", label: "System size" },
    { key: "panels", label: "Panels" },
    { key: "module", label: "Module" },
    { key: "inverter", label: "Inverter" },
    { key: "battery", label: "Battery" },
    { key: "status", label: "Status" },
    { key: "nextStep", label: "Next step" },
    { key: "workflowDate", label: "Workflow date" },
    { key: "rep", label: "Rep" },
    ...(canSeeFinancials ? [{ key: "outstanding", label: "Outstanding" }] : []),
  ];

  const tableColumns = [
    { key: "jobNumber", label: "Job #" },
    { key: "customer", label: "Customer" },
    { key: "fullAddress", label: "Full address" },
    ...(visibleColumns.installScheduledDate ? [{ key: "installScheduledDate", label: "Install scheduled" }] : []),
    ...(visibleColumns.installCompletedDate ? [{ key: "installCompletedDate", label: "Install completed" }] : []),
    ...(visibleColumns.inspectionDate ? [{ key: "inspectionDate", label: "Inspection date" }] : []),
    ...(visibleColumns.systemSize ? [{ key: "systemSize", label: "System size" }] : []),
    ...(visibleColumns.panels ? [{ key: "panels", label: "Panels" }] : []),
    ...(visibleColumns.module ? [{ key: "module", label: "Module" }] : []),
    ...(visibleColumns.inverter ? [{ key: "inverter", label: "Inverter" }] : []),
    ...(visibleColumns.battery ? [{ key: "battery", label: "Battery" }] : []),
    ...(visibleColumns.status ? [{ key: "status", label: "Status" }] : []),
    ...(visibleColumns.nextStep ? [{ key: "nextStep", label: "Next step" }] : []),
    ...(visibleColumns.workflowDate ? [{ key: "workflowDate", label: "Workflow date" }] : []),
    ...(visibleColumns.rep ? [{ key: "rep", label: "Rep" }] : []),
    ...(canSeeFinancials && visibleColumns.outstanding ? [{ key: "outstanding", label: "Outstanding" }] : []),
  ];

  function toggleSort(key) {
    setSortState((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: "asc",
      };
    });
  }

  function handleAllJobsClick() {
    if (activeQueueKey === "all") {
      setShowAllJobs((current) => !current);
      return;
    }

    setActiveQueueKey("all");
    setShowAllJobs(false);
  }

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Daily action board</h1>
          <p>Use the queues below to work installs, invoices, PTO, collections, and problem jobs.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {canSeeFinancials ? (
            <Link href="/invoices">
              <button className="btn btn-outline" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CircleDollarSign size={14} /> Billing
              </button>
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ marginBottom: 18, fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
        {loading || roleLoading ? "Loading..." : showAllJobs ? `Showing ${jobs.length} total jobs` : `Showing ${activeJobs.length} active jobs`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        <button
          type="button"
          onClick={handleAllJobsClick}
          className="card"
          style={{
            padding: "18px",
            border: activeQueueKey === "all" ? "1px solid var(--text-primary)" : "1px solid var(--border)",
            background: activeQueueKey === "all" ? "var(--surface-2)" : "var(--surface)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{showAllJobs ? "All jobs" : "All active jobs"}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {showAllJobs ? "Showing the full database, including closed jobs." : "Show the full open pipeline."}
              </div>
            </div>
            <div style={{ minWidth: 38, height: 38, borderRadius: 12, background: "var(--text-primary)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontWeight: 800 }}>
              {showAllJobs ? jobs.length : activeJobs.length}
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {activeQueueKey === "all"
              ? showAllJobs
                ? "Click again to go back to active jobs only."
                : "Click again to include closed jobs too."
              : "Click to reset the worklist."}
          </div>
        </button>

        {queueData.map((queue) => (
          <button
            key={queue.key}
            type="button"
            onClick={() => {
              setActiveQueueKey(queue.key);
              setShowAllJobs(false);
            }}
            className="card"
            style={{
              padding: "18px",
              border: activeQueueKey === queue.key ? "1px solid var(--text-primary)" : "1px solid var(--border)",
              background: activeQueueKey === queue.key ? "var(--surface-2)" : "var(--surface)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--surface-2)", color: "var(--text-secondary)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <queue.icon size={16} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{queue.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{queue.description}</div>
                </div>
              </div>
              <div style={{ minWidth: 38, height: 38, borderRadius: 12, background: "var(--text-primary)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontWeight: 800 }}>
                {queue.jobs.length}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {activeQueueKey === queue.key ? "Currently driving the master worklist." : "Click to filter the worklist to this queue."}
            </div>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: "18px 20px" }}>
        <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {activeQueue ? activeQueue.title : showAllJobs ? "All jobs" : "Master worklist"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {activeQueue ? activeQueue.description : showAllJobs ? "Showing every job, including closed and cancelled records." : "Showing the full active pipeline."}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 260,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface-2)",
              }}
            >
              <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search job #, customer, address..."
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  padding: "10px 0",
                }}
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
              }}
            >
              {`Sorted by ${tableColumns.find((column) => column.key === sortState.key)?.label || "Workflow date"} ${sortState.direction === "asc" ? "ascending" : "descending"}`}
            </div>
            <div style={{ position: "relative" }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowColumnPicker((value) => !value)}
            >
              Columns
            </button>
            {showColumnPicker ? (
              <div
                className="card"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 220,
                  padding: "14px 16px",
                  zIndex: 20,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                  Optional columns
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {optionalColumns.map((column) => (
                    <label key={column.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={visibleColumns[column.key]}
                        onChange={() => {
                          setVisibleColumns((current) => ({
                            ...current,
                            [column.key]: !current[column.key],
                          }));
                        }}
                      />
                      {column.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: 34 }}>Loading jobs...</div>
        ) : worklist.length === 0 ? (
          <div className="empty-state" style={{ padding: 34 }}>
            {searchTerm
              ? "No jobs match that search."
              : activeQueue
                ? `No jobs are in the ${activeQueue.title.toLowerCase()} right now.`
                : "No active jobs right now."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.35 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  {tableColumns.map((column) => (
                    <th
                      key={column.key}
                      style={{
                        padding: "6px 12px",
                        textAlign: "left",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: ".05em",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        style={{
                          border: "none",
                          background: sortState.key === column.key ? "var(--surface)" : "transparent",
                          borderRadius: 999,
                          padding: "5px 9px",
                          margin: 0,
                          font: "inherit",
                          color: sortState.key === column.key ? "var(--text-primary)" : "var(--text-secondary)",
                          textTransform: "inherit",
                          letterSpacing: "inherit",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          fontWeight: sortState.key === column.key ? 700 : 600,
                          boxShadow: sortState.key === column.key ? "inset 0 0 0 1px var(--border)" : "none",
                        }}
                      >
                        <span>{column.label}</span>
                        {sortState.key === column.key ? (
                          sortState.direction === "asc" ? (
                            <ArrowUp size={12} />
                          ) : (
                            <ArrowDown size={12} />
                          )
                        ) : (
                          <span style={{ width: 12, height: 12, display: "inline-block", color: "var(--text-tertiary)" }} />
                        )}
                      </button>
                    </th>
                  ))}
                  <th
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  />
                </tr>
              </thead>
              <tbody>
                {worklist.map((job, index) => {
                  const status = statusMeta(job.currentStatus);
                  const issue = ["inspection_failed", "on_hold"].includes(job.currentStatus);
                  const fullAddress = getFullAddress(job);
                  const inspectionDate = getInspectionDate(job);
                  return (
                    <tr
                      key={job.id}
                      onClick={() => { window.location.href = `/jobs/${job.jobNumber}`; }}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        background: issue ? "var(--red-bg)" : index % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                      }}
                    >
                      <td style={cellStyle({ whiteSpace: "nowrap" })}>
                        <span className="mono badge badge-slate">{job.jobNumber}</span>
                      </td>
                      <td style={cellStyle({ minWidth: 180 })}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {issue && <AlertTriangle size={13} style={{ color: "#dc2626", flexShrink: 0 }} />}
                          <div>
                            <div style={{ fontWeight: 700 }}>{job.customerName}</div>
                          </div>
                        </div>
                      </td>
                      <td style={cellStyle({ color: "var(--text-secondary)", minWidth: 260 })}>{fullAddress}</td>
                      {visibleColumns.installScheduledDate ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {formatDate(job.installScheduledAt)}
                        </td>
                      ) : null}
                      {visibleColumns.installCompletedDate ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {formatDate(job.installCompletedAt)}
                        </td>
                      ) : null}
                      {visibleColumns.inspectionDate ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {formatDate(inspectionDate)}
                        </td>
                      ) : null}
                      {visibleColumns.systemSize ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {job.systemSizeKw ? `${job.systemSizeKw} kW` : "-"}
                        </td>
                      ) : null}
                      {visibleColumns.panels ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {job.panelCount || "-"}
                        </td>
                      ) : null}
                      {visibleColumns.module ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", minWidth: 160 })}>{job.module || "-"}</td>
                      ) : null}
                      {visibleColumns.inverter ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", minWidth: 160 })}>{job.inverter || "-"}</td>
                      ) : null}
                      {visibleColumns.battery ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {job.battery ? "Yes" : "No"}
                        </td>
                      ) : null}
                      {visibleColumns.status ? (
                        <td style={cellStyle()}>
                          <span style={{ padding: "4px 9px", borderRadius: 999, background: status.bg, color: status.color, fontSize: 11, fontWeight: 700 }}>
                            {status.label}
                          </span>
                        </td>
                      ) : null}
                      {visibleColumns.nextStep ? (
                        <td style={cellStyle({ fontWeight: 600, color: "var(--text-primary)", minWidth: 150 })}>{nextAction(job)}</td>
                      ) : null}
                      {visibleColumns.workflowDate ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>{formatDate(getJobWorkflowDate(job))}</td>
                      ) : null}
                      {visibleColumns.rep ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>{job.repName || "-"}</td>
                      ) : null}
                      {canSeeFinancials && visibleColumns.outstanding ? (
                        <td style={cellStyle({ whiteSpace: "nowrap", fontWeight: 700 })}>
                          {formatCurrency((job.financialSummary?.outstandingCents || 0) / 100)}
                        </td>
                      ) : null}
                      <td style={cellStyle({ whiteSpace: "nowrap" })}><ChevronRight size={15} style={{ color: "var(--text-tertiary)" }} /></td>
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
