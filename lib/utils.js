const EASTERN_TIME_ZONE = "America/New_York";

function parseDateForComparison(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function statusBadgeClass(status) {
  const map = {
    Review: "badge-slate",
    "Design Review": "badge-slate",
    "PTO Hold": "badge-amber",
    "Permit Pending": "badge-blue",
    Scheduled: "badge-blue",
    "Fully Paid / Closed": "badge-dark",
    "Rescheduled / Issue": "badge-red",
    "In Progress": "badge-amber",
    Completed: "badge-green",
    "Install Complete": "badge-green",
    "Inspection Scheduled": "badge-blue",
    "Inspection Passed": "badge-green",
    "Inspection Failed": "badge-red",
    "Service Call": "badge-red",
    "Site Visit": "badge-amber",
    Approved: "badge-green",
    "In Review": "badge-amber",
    Submitted: "badge-blue",
    "Utility Redesign Needed": "badge-amber",
    "Not Submitted": "badge-slate",
    Paid: "badge-green",
    Pending: "badge-amber",
    Overdue: "badge-red",
    High: "badge-red",
    Medium: "badge-amber",
    Low: "badge-slate",
    Open: "badge-red",
    Resolved: "badge-green",
    Confirmed: "badge-green",
    Tentative: "badge-amber",
    Cancelled: "badge-red",
    Install: "badge-blue",
    Inspection: "badge-blue",
    Service: "badge-amber",
  };
  return map[status] || "badge-slate";
}

export const STAGES = [
  "Installation",
  "Inspections",
  "PTO & Commissioning",
  "Accounting & Funding",
  "Completed",
  "SERVICE",
];

export const STAGE_COLORS = {
  Installation: { bg: "#dbeafe", color: "#1e3a8a" },
  Inspections: { bg: "#fef3c7", color: "#78350f" },
  "PTO & Commissioning": { bg: "#ede9fe", color: "#4c1d95" },
  "Accounting & Funding": { bg: "#d8f3dc", color: "#1b4332" },
  Completed: { bg: "#1a1917", color: "#ffffff" },
  SERVICE: { bg: "#fee2e2", color: "#7f1d1d" },
};

export function computeStage(job) {
  if (job.flagged === true || job.status === "Rescheduled / Issue") return "SERVICE";

  if (job.m1Status && job.m2Status) return "Completed";

  if (
    job.inspectionStatus === "Passed" ||
    job.status === "Inspection Passed" ||
    job.status === "Fully Paid / Closed"
  ) {
    return "Accounting & Funding";
  }

  if (
    job.installStatus === "Complete" ||
    job.status === "Install Complete" ||
    job.status === "Inspection Scheduled"
  ) {
    return "Inspections";
  }

  if (job.stage === "PTO & Commissioning") return "PTO & Commissioning";

  return "Installation";
}

export function getJobWorkflowDate(job) {
  if (!job) return null;

  const currentStatus = String(job.currentStatus || "").toLowerCase();

  switch (currentStatus) {
    case "scheduled":
      return job.installScheduledAt || job.currentStatusChangedAt || null;
    case "install_completed":
      return job.installCompletedAt || job.currentStatusChangedAt || job.installScheduledAt || null;
    case "inspection_scheduled":
    case "inspection_failed":
    case "inspection_passed":
      return job.currentStatusChangedAt || job.installCompletedAt || job.installScheduledAt || null;
    case "pto_submitted":
      return job.ptoSubmittedAt || job.currentStatusChangedAt || job.installCompletedAt || null;
    case "pto_granted":
      return job.ptoGrantedAt || job.currentStatusChangedAt || job.ptoSubmittedAt || null;
    case "m1_invoiced":
    case "m1_partially_paid":
    case "m1_paid":
    case "m2_invoiced":
    case "m2_partially_paid":
    case "paid_in_full":
    case "on_hold":
    case "cancelled":
      return job.currentStatusChangedAt || job.ptoGrantedAt || job.installCompletedAt || job.installScheduledAt || null;
    default:
      return job.currentStatusChangedAt || job.installScheduledAt || job.installCompletedAt || null;
  }
}

export function getJobSortTime(job) {
  const primary = parseDateForComparison(getJobWorkflowDate(job));
  if (primary) return primary.getTime();

  const fallbacks = [
    job?.currentStatusChangedAt,
    job?.ptoGrantedAt,
    job?.ptoSubmittedAt,
    job?.installCompletedAt,
    job?.installScheduledAt,
    job?.createdAt,
  ];

  for (const value of fallbacks) {
    const parsed = parseDateForComparison(value);
    if (parsed) return parsed.getTime();
  }

  return 0;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [month, day, year] = raw.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasExplicitTime(value) {
  if (!value) return false;
  return /[tT]\d{2}:\d{2}/.test(String(value)) || /\d{1,2}:\d{2}/.test(String(value));
}

export function formatDate(dateValue) {
  const parsed = parseDateValue(dateValue);
  if (!parsed) return "-";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatTime(dateValue) {
  const parsed = parseDateValue(dateValue);
  if (!parsed || !hasExplicitTime(dateValue)) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(parsed);

  const value = parts.map((part) => part.value).join("");
  return value.replace(/\bEDT\b|\bEST\b/, "ET");
}

export function formatDateTimeParts(dateValue) {
  return {
    date: formatDate(dateValue),
    time: formatTime(dateValue),
  };
}

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === "") return "-";
  const num = Number(amount);
  if (Number.isNaN(num)) return "-";
  return "$" + num.toLocaleString();
}
