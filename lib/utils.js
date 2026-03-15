export function statusBadgeClass(status) {
  const map = {
    "Review":               "badge-slate",
    "Design Review":        "badge-slate",
    "PTO Hold":             "badge-amber",
    "Permit Pending":       "badge-blue",
    "Scheduled":            "badge-blue",
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

export function stageColor(stage) {
  if (stage >= 90) return "#2d6a4f";
  if (stage >= 60) return "#92400e";
  return "var(--text-primary)";
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCurrency(amount) {
  if (amount === undefined || amount === null || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  return "$" + num.toLocaleString();
}