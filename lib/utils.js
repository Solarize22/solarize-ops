export function statusBadgeClass(status) {
  const map = {
    "Review":               "badge-slate",
    "Design Review":        "badge-slate",
    "PTO Hold":             "badge-amber",
    "Permit Pending":       "badge-blue",
    "Scheduled":            "badge-blue",
    "Fully Paid / Closed":  "badge-dark",
    "Rescheduled / Issue":  "badge-red",
    "In Progress":          "badge-amber",
    "Install Complete":     "badge-green",
    "Inspection Scheduled": "badge-blue",
    "Inspection Passed":    "badge-green",
    "Inspection Failed":    "badge-red",
    "Service Call":         "badge-red",
    "Site Visit":           "badge-amber",
    "Approved":             "badge-green",
    "In Review":            "badge-amber",
    "Submitted":            "badge-blue",
    "Utility Redesign Needed": "badge-amber",
    "Not Submitted":        "badge-slate",
    "Paid":                 "badge-green",
    "Pending":              "badge-amber",
    "Overdue":              "badge-red",
    "High":                 "badge-red",
    "Medium":               "badge-amber",
    "Low":                  "badge-slate",
    "Open":                 "badge-red",
    "In Progress":          "badge-amber",
    "Resolved":             "badge-green",
    "Confirmed":            "badge-green",
    "Tentative":            "badge-amber",
    "Cancelled":            "badge-red",
    "Install":              "badge-dark",
    "Inspection":           "badge-blue",
    "Service":              "badge-amber",
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
  "Installation":          { bg: "#dbeafe", color: "#1e3a8a" },
  "Inspections":           { bg: "#fef3c7", color: "#78350f" },
  "PTO & Commissioning":   { bg: "#ede9fe", color: "#4c1d95" },
  "Accounting & Funding":  { bg: "#d8f3dc", color: "#1b4332" },
  "Completed":             { bg: "#1a1917", color: "#ffffff" },
  "SERVICE":               { bg: "#fee2e2", color: "#7f1d1d" },
};

export function computeStage(job) {
  // Rule 4 — SERVICE overrides everything
  if (job.flagged === true || job.status === "Rescheduled / Issue") return "SERVICE";

  // Rule 3 — Both milestones received → Completed
  if (job.m1Received && job.m2Received) return "Completed";

  // Rule 2 — Inspection passed → Accounting & Funding
  if (
    job.inspectionStatus === "Passed" ||
    job.status === "Inspection Passed" ||
    job.status === "Fully Paid / Closed"
  ) return "Accounting & Funding";

  // Rule 1 — Install complete → Inspections
  if (
    job.installStatus === "Complete" ||
    job.status === "Install Complete" ||
    job.status === "Inspection Scheduled"
  ) return "Inspections";

  // PTO & Commissioning — manual only, hold if already set
  if (job.stage === "PTO & Commissioning") return "PTO & Commissioning";

  return "Installation";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  // Normalize MM/DD/YYYY → YYYY-MM-DD so the T00:00:00 suffix works correctly
  const normalized = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)
    ? dateStr.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, "$3-$1-$2").replace(/-(\d)-/g, "-0$1-").replace(/-(\d)$/, "-0$1")
    : dateStr;
  const d = new Date(normalized + "T00:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  return "$" + num.toLocaleString();
}