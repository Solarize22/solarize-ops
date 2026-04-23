"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { CalendarDays, CircleDollarSign, ClipboardList, AlertTriangle, ChevronRight, Search, ArrowUp, ArrowDown, MessageSquareMore, UserRound } from "lucide-react";
import { getWorkflowAdvanceAction } from "@/lib/job-workflow";
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
    key: "fieldwork",
    title: "Field follow-up",
    description: "Open site visits, service calls, or revisit work that still needs attention.",
    empty: "No field follow-up is open right now.",
    icon: CalendarDays,
    match: (job) => (job.fieldTrackingSummary?.openVisitCount || 0) > 0,
  },
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
const JOBS_WORKLIST_CRM_FILTER_KEY = "jobs-worklist-crm-filter-v1";

const DEFAULT_VISIBLE_COLUMNS = {
  installScheduledDate: false,
  installCompletedDate: false,
  installDays: false,
  inspectionDate: false,
  inspectionResult: false,
  nextFieldVisit: false,
  activeRevisits: false,
  systemSize: false,
  panels: false,
  module: false,
  inverter: false,
  battery: false,
  status: true,
  nextStep: true,
  workflowDate: true,
  lastContact: true,
  nextFollowUp: true,
  followUpOwner: false,
  openTasks: false,
  rep: false,
  outstanding: false,
};

const CRM_FILTERS = [
  { key: "all", label: "All CRM signals" },
  { key: "overdueFollowUp", label: "Overdue follow-up" },
  { key: "noRecentContact", label: "No recent contact" },
  { key: "openTasks", label: "Open tasks" },
  { key: "crmRisk", label: "CRM risk" },
  { key: "fieldwork", label: "Field follow-up" },
];

function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.created;
}

function nextAction(job) {
  switch (job.currentStatus) {
    case "created":
      return "Schedule install";
    case "scheduled":
      return "Close install";
    case "install_completed":
      return "Schedule inspection";
    case "inspection_scheduled":
      return "Log inspection result";
    case "inspection_failed":
      return "Reschedule inspection";
    case "inspection_passed":
      return "Submit PTO";
    case "pto_submitted":
      return "Track utility PTO";
    case "pto_granted":
      return "Start final billing";
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

function getLastContactDate(job) {
  return job.crmSummary?.lastContactAt || null;
}

function getNextFollowUpDate(job) {
  return job.crmSummary?.nextFollowUpAt || null;
}

function getOpenTaskCount(job) {
  return job.crmSummary?.openTaskCount ?? 0;
}

function getOverdueTaskCount(job) {
  return job.crmSummary?.overdueTaskCount ?? 0;
}

function getInstallDayCount(job) {
  return job.fieldTrackingSummary?.installDayCount ?? 0;
}

function getInspectionResult(job) {
  return job.inspectionResult || null;
}

function getNextFieldVisitDate(job) {
  return job.fieldTrackingSummary?.nextVisitDate || null;
}

function getNextFieldVisitType(job) {
  return job.fieldTrackingSummary?.nextVisitType || null;
}

function getOpenVisitCount(job) {
  return job.fieldTrackingSummary?.openVisitCount ?? 0;
}

function hasCrmRisk(job) {
  const overdueTasks = getOverdueTaskCount(job);
  const nextFollowUp = getNextFollowUpDate(job);
  const lastContact = getLastContactDate(job);
  const today = new Date().toISOString().slice(0, 10);

  if (overdueTasks > 0) return true;
  if (nextFollowUp && String(nextFollowUp) < today) return true;
  if (lastContact) {
    const lastContactTime = new Date(lastContact).getTime();
    if (!Number.isNaN(lastContactTime)) {
      const days = Math.floor((Date.now() - lastContactTime) / 86400000);
      if (days >= 7) return true;
    }
  }
  return false;
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
    case "installDays":
      return getInstallDayCount(job);
    case "inspectionDate": {
      const inspectionDate = getInspectionDate(job);
      return inspectionDate ? new Date(inspectionDate).getTime() : null;
    }
    case "inspectionResult":
      return getInspectionResult(job) || "";
    case "nextFieldVisit":
      return getNextFieldVisitDate(job) ? new Date(getNextFieldVisitDate(job)).getTime() : null;
    case "activeRevisits":
      return getOpenVisitCount(job);
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
    case "lastContact":
      return getLastContactDate(job) ? new Date(getLastContactDate(job)).getTime() : null;
    case "nextFollowUp":
      return getNextFollowUpDate(job) ? new Date(getNextFollowUpDate(job)).getTime() : null;
    case "followUpOwner":
      return job.crmSummary?.followUpOwnerName || "";
    case "openTasks":
      return getOpenTaskCount(job);
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
    job.crmSummary?.followUpOwnerName,
    getFullAddress(job),
    job.address?.city,
    job.address?.state,
    job.address?.postalCode,
    job.module,
    job.inverter,
    getInspectionResult(job),
    getNextFieldVisitType(job),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchTerm);
}

export default function JobsPage() {
  const { canSeeFinancials, isAdmin, isOwner, loading: roleLoading, role } = useUserRole();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeQueueKey, setActiveQueueKey] = useState("all");
  const [showAllJobs, setShowAllJobs] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortState, setSortState] = useState({ key: "workflowDate", direction: "asc" });
  const [crmFilter, setCrmFilter] = useState("all");
  const [boardMessage, setBoardMessage] = useState({ type: "", text: "" });
  const [updatingJobId, setUpdatingJobId] = useState("");
  const [visibleColumns, setVisibleColumns] = useState({
    ...DEFAULT_VISIBLE_COLUMNS,
    outstanding: canSeeFinancials,
  });
  const canManageOps = isOwner || isAdmin || role === "ops";

  async function loadJobs() {
    setLoading(true);
    try {
      const response = await fetch("/api/v2/jobs");
      const data = response.ok ? await response.json().catch(() => []) : [];
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
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

      const savedCrmFilter = window.localStorage.getItem(JOBS_WORKLIST_CRM_FILTER_KEY);
      if (savedCrmFilter && CRM_FILTERS.some((filter) => filter.key === savedCrmFilter)) {
        setCrmFilter(savedCrmFilter);
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
    const crmFilteredJobs = sourceJobs.filter((job) => {
      switch (crmFilter) {
        case "overdueFollowUp": {
          const nextFollowUp = getNextFollowUpDate(job);
          return !!nextFollowUp && String(nextFollowUp) < new Date().toISOString().slice(0, 10);
        }
        case "noRecentContact": {
          const lastContact = getLastContactDate(job);
          if (!lastContact) return true;
          const lastContactTime = new Date(lastContact).getTime();
          if (Number.isNaN(lastContactTime)) return false;
          return Math.floor((Date.now() - lastContactTime) / 86400000) >= 7;
        }
        case "openTasks":
          return getOpenTaskCount(job) > 0;
        case "crmRisk":
          return hasCrmRisk(job);
        case "fieldwork":
          return getOpenVisitCount(job) > 0;
        default:
          return true;
      }
    });
    const filteredJobs = crmFilteredJobs.filter((job) => matchesWorklistSearch(job, normalizedSearchTerm));
    const sortedJobs = [...filteredJobs].sort((a, b) => {
      const primary = compareValues(getSortValue(a, sortState.key), getSortValue(b, sortState.key), sortState.direction);
      if (primary !== 0) return primary;
      return queueSort(a) - queueSort(b);
    });

    return sortedJobs.slice(0, 100);
  }, [activeJobs, activeQueue, crmFilter, jobs, normalizedSearchTerm, showAllJobs, sortState]);

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

  useEffect(() => {
    if (!preferencesReady || typeof window === "undefined") return;
    window.localStorage.setItem(JOBS_WORKLIST_CRM_FILTER_KEY, crmFilter);
  }, [crmFilter, preferencesReady]);

  const crmCounts = useMemo(() => ({
    overdueFollowUp: activeJobs.filter((job) => {
      const nextFollowUp = getNextFollowUpDate(job);
      return !!nextFollowUp && String(nextFollowUp) < new Date().toISOString().slice(0, 10);
    }).length,
    noRecentContact: activeJobs.filter((job) => {
      const lastContact = getLastContactDate(job);
      if (!lastContact) return true;
      const lastContactTime = new Date(lastContact).getTime();
      if (Number.isNaN(lastContactTime)) return false;
      return Math.floor((Date.now() - lastContactTime) / 86400000) >= 7;
    }).length,
    openTasks: activeJobs.filter((job) => getOpenTaskCount(job) > 0).length,
    crmRisk: activeJobs.filter((job) => hasCrmRisk(job)).length,
    fieldwork: activeJobs.filter((job) => getOpenVisitCount(job) > 0).length,
  }), [activeJobs]);

  const optionalColumns = [
    { key: "installScheduledDate", label: "Install scheduled" },
    { key: "installCompletedDate", label: "Install completed" },
    { key: "installDays", label: "Install days" },
    { key: "inspectionDate", label: "Inspection date" },
    { key: "inspectionResult", label: "Inspection result" },
    { key: "nextFieldVisit", label: "Next field visit" },
    { key: "activeRevisits", label: "Field follow-up" },
    { key: "systemSize", label: "System size" },
    { key: "panels", label: "Panels" },
    { key: "module", label: "Module" },
    { key: "inverter", label: "Inverter" },
    { key: "battery", label: "Battery" },
    { key: "status", label: "Status" },
    { key: "nextStep", label: "Next step" },
    { key: "workflowDate", label: "Workflow date" },
    { key: "lastContact", label: "Last contact" },
    { key: "nextFollowUp", label: "Next follow-up" },
    { key: "followUpOwner", label: "Follow-up owner" },
    { key: "openTasks", label: "Open tasks" },
    { key: "rep", label: "Rep" },
    ...(canSeeFinancials ? [{ key: "outstanding", label: "Outstanding" }] : []),
  ];

  const tableColumns = [
    { key: "jobNumber", label: "Job #" },
    { key: "customer", label: "Customer" },
    { key: "fullAddress", label: "Full address" },
    ...(visibleColumns.installScheduledDate ? [{ key: "installScheduledDate", label: "Install scheduled" }] : []),
    ...(visibleColumns.installCompletedDate ? [{ key: "installCompletedDate", label: "Install completed" }] : []),
    ...(visibleColumns.installDays ? [{ key: "installDays", label: "Install days" }] : []),
    ...(visibleColumns.inspectionDate ? [{ key: "inspectionDate", label: "Inspection date" }] : []),
    ...(visibleColumns.inspectionResult ? [{ key: "inspectionResult", label: "Inspection result" }] : []),
    ...(visibleColumns.nextFieldVisit ? [{ key: "nextFieldVisit", label: "Next field visit" }] : []),
    ...(visibleColumns.activeRevisits ? [{ key: "activeRevisits", label: "Field follow-up" }] : []),
    ...(visibleColumns.systemSize ? [{ key: "systemSize", label: "System size" }] : []),
    ...(visibleColumns.panels ? [{ key: "panels", label: "Panels" }] : []),
    ...(visibleColumns.module ? [{ key: "module", label: "Module" }] : []),
    ...(visibleColumns.inverter ? [{ key: "inverter", label: "Inverter" }] : []),
    ...(visibleColumns.battery ? [{ key: "battery", label: "Battery" }] : []),
    ...(visibleColumns.status ? [{ key: "status", label: "Status" }] : []),
    ...(visibleColumns.nextStep ? [{ key: "nextStep", label: "Next step" }] : []),
    ...(visibleColumns.workflowDate ? [{ key: "workflowDate", label: "Workflow date" }] : []),
    ...(visibleColumns.lastContact ? [{ key: "lastContact", label: "Last contact" }] : []),
    ...(visibleColumns.nextFollowUp ? [{ key: "nextFollowUp", label: "Next follow-up" }] : []),
    ...(visibleColumns.followUpOwner ? [{ key: "followUpOwner", label: "Follow-up owner" }] : []),
    ...(visibleColumns.openTasks ? [{ key: "openTasks", label: "Open tasks" }] : []),
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

  async function runBoardQuickAction(event, job, action) {
    event.preventDefault();
    event.stopPropagation();
    setBoardMessage({ type: "", text: "" });
    setUpdatingJobId(job.id);

    try {
      const res = await fetch(`/api/v2/jobs/${job.jobNumber}/status-transitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: action.toStatus,
          effectiveDate: action.effectiveDate,
          note: action.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to move job forward");
      setBoardMessage({ type: "success", text: `${job.jobNumber} moved to ${statusMeta(action.toStatus).label}.` });
      await loadJobs();
    } catch (error) {
      setBoardMessage({ type: "error", text: error.message || "Failed to move job forward" });
    } finally {
      setUpdatingJobId("");
    }
  }

  return (
    <AppShell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Daily action board</h1>
          <p>Use the queues and CRM filters below to work installs, homeowner follow-up, invoices, PTO, and problem jobs.</p>
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

      {boardMessage.text ? (
        <div
          className="card"
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            border: boardMessage.type === "error" ? "1px solid #fecaca" : "1px solid #bbf7d0",
            background: boardMessage.type === "error" ? "#fff5f5" : "#f0fdf4",
            color: boardMessage.type === "error" ? "#991b1b" : "#166534",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {boardMessage.text}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
          <MessageSquareMore size={14} />
          CRM focus
        </div>
        <div className="segmented-control">
          {CRM_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setCrmFilter(filter.key)}
              className={`segmented-button ${crmFilter === filter.key ? "active" : ""}`}
            >
              {filter.label}
              {filter.key === "overdueFollowUp" ? ` (${crmCounts.overdueFollowUp})` : ""}
              {filter.key === "noRecentContact" ? ` (${crmCounts.noRecentContact})` : ""}
              {filter.key === "openTasks" ? ` (${crmCounts.openTasks})` : ""}
              {filter.key === "crmRisk" ? ` (${crmCounts.crmRisk})` : ""}
              {filter.key === "fieldwork" ? ` (${crmCounts.fieldwork})` : ""}
            </button>
          ))}
        </div>
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
              {crmFilter !== "all" ? ` CRM filter: ${CRM_FILTERS.find((filter) => filter.key === crmFilter)?.label || "All CRM signals"}.` : ""}
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
                  >
                    Advance
                  </th>
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
                  const crmRisk = hasCrmRisk(job);
                  const fullAddress = getFullAddress(job);
                  const inspectionDate = getInspectionDate(job);
                  const inspectionResult = getInspectionResult(job);
                  const nextFieldVisitDate = getNextFieldVisitDate(job);
                  const nextFieldVisitType = getNextFieldVisitType(job);
                  const openVisitCount = getOpenVisitCount(job);
                  const workflowAction = canManageOps ? getWorkflowAdvanceAction(job, "Jobs board") : null;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => { window.location.href = `/jobs/${job.jobNumber}`; }}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        background: issue ? "var(--red-bg)" : crmRisk ? "#fff8e8" : index % 2 === 0 ? "var(--surface)" : "var(--surface-2)",
                      }}
                    >
                      <td style={cellStyle({ whiteSpace: "nowrap" })}>
                        <span className="mono badge badge-slate">{job.jobNumber}</span>
                      </td>
                      <td style={cellStyle({ minWidth: 180 })}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {issue && <AlertTriangle size={13} style={{ color: "#dc2626", flexShrink: 0 }} />}
                          {!issue && crmRisk ? <MessageSquareMore size={13} style={{ color: "#b36f10", flexShrink: 0 }} /> : null}
                          <div>
                            <div style={{ fontWeight: 700 }}>{job.customerName}</div>
                            {job.customerPath ? (
                              <Link
                                href={job.customerPath}
                                onClick={(event) => event.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textDecoration: "none" }}
                              >
                                <UserRound size={11} />
                                Customer record
                              </Link>
                            ) : null}
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
                      {visibleColumns.installDays ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {getInstallDayCount(job) > 0 ? (
                            <span className="badge badge-blue">
                              {getInstallDayCount(job)} day{getInstallDayCount(job) === 1 ? "" : "s"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </td>
                      ) : null}
                      {visibleColumns.inspectionDate ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {formatDate(inspectionDate)}
                        </td>
                      ) : null}
                      {visibleColumns.inspectionResult ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {inspectionResult ? (
                            <span className={`badge ${inspectionResult === "passed" ? "badge-green" : inspectionResult === "failed" ? "badge-red" : inspectionResult === "cancelled" ? "badge-slate" : "badge-blue"}`}>
                              {String(inspectionResult).replace(/_/g, " ")}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </td>
                      ) : null}
                      {visibleColumns.nextFieldVisit ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {nextFieldVisitDate ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              <span style={{ fontWeight: 700 }}>{formatDate(nextFieldVisitDate)}</span>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{nextFieldVisitType ? String(nextFieldVisitType).replace(/_/g, " ") : "Field visit"}</span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </td>
                      ) : null}
                      {visibleColumns.activeRevisits ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {openVisitCount > 0 ? (
                            <span className={`badge ${job.fieldTrackingSummary?.openServiceCallCount > 0 ? "badge-red" : "badge-amber"}`}>
                              {openVisitCount} open
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>0</span>
                          )}
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
                      {visibleColumns.lastContact ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          {formatDate(getLastContactDate(job))}
                        </td>
                      ) : null}
                      {visibleColumns.nextFollowUp ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {getNextFollowUpDate(job) ? (
                            <span className={`badge ${String(getNextFollowUpDate(job)) < new Date().toISOString().slice(0, 10) ? "badge-red" : "badge-blue"}`}>
                              {formatDate(getNextFollowUpDate(job))}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>-</span>
                          )}
                        </td>
                      ) : null}
                      {visibleColumns.followUpOwner ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <UserRound size={12} />
                            {job.crmSummary?.followUpOwnerName || "-"}
                          </div>
                        </td>
                      ) : null}
                      {visibleColumns.openTasks ? (
                        <td style={cellStyle({ whiteSpace: "nowrap" })}>
                          {getOpenTaskCount(job) > 0 ? (
                            <span className={`badge ${getOverdueTaskCount(job) > 0 ? "badge-red" : "badge-amber"}`}>
                              {getOpenTaskCount(job)} open{getOverdueTaskCount(job) > 0 ? ` · ${getOverdueTaskCount(job)} overdue` : ""}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-secondary)" }}>0</span>
                          )}
                        </td>
                      ) : null}
                      {visibleColumns.rep ? (
                        <td style={cellStyle({ color: "var(--text-secondary)", whiteSpace: "nowrap" })}>{job.repName || "-"}</td>
                      ) : null}
                      {canSeeFinancials && visibleColumns.outstanding ? (
                        <td style={cellStyle({ whiteSpace: "nowrap", fontWeight: 700 })}>
                          {formatCurrency((job.financialSummary?.outstandingCents || 0) / 100)}
                        </td>
                      ) : null}
                      <td style={cellStyle({ minWidth: 150 })} onClick={(event) => event.stopPropagation()}>
                        {workflowAction ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={(event) => runBoardQuickAction(event, job, workflowAction)}
                              disabled={updatingJobId === job.id}
                              style={{ width: "100%", justifyContent: "center" }}
                            >
                              {updatingJobId === job.id ? "Saving..." : workflowAction.shortLabel}
                            </button>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                              {workflowAction.description}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {canManageOps ? "Open job for details" : "View details"}
                          </span>
                        )}
                      </td>
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
