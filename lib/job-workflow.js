export const JOB_STATUS_OPTIONS = [
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

const LINEAR_STATUS_OPTIONS = [
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
];

const STATUS_TRANSITIONS = {
  created: ["scheduled", "on_hold", "cancelled"],
  scheduled: ["install_completed", "on_hold", "cancelled"],
  install_completed: ["inspection_scheduled", "inspection_passed", "m1_invoiced", "on_hold", "cancelled"],
  inspection_scheduled: ["inspection_passed", "inspection_failed", "on_hold", "cancelled"],
  inspection_failed: ["inspection_scheduled", "inspection_passed", "on_hold", "cancelled"],
  inspection_passed: ["pto_submitted", "pto_granted", "m1_invoiced", "on_hold", "cancelled"],
  pto_submitted: ["pto_granted", "on_hold", "cancelled"],
  pto_granted: ["m2_invoiced", "paid_in_full", "on_hold", "cancelled"],
  m1_invoiced: ["m1_partially_paid", "m1_paid", "on_hold", "cancelled"],
  m1_partially_paid: ["m1_paid", "on_hold", "cancelled"],
  m1_paid: ["m2_invoiced", "paid_in_full", "on_hold", "cancelled"],
  m2_invoiced: ["m2_partially_paid", "paid_in_full", "on_hold", "cancelled"],
  m2_partially_paid: ["paid_in_full", "on_hold", "cancelled"],
  paid_in_full: [],
  on_hold: [
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
    "cancelled",
  ],
  cancelled: [],
};

export function getAllowedStatusTransitions(currentStatus) {
  return STATUS_TRANSITIONS[String(currentStatus || "").trim()] || [];
}

export function canTransitionStatus(currentStatus, nextStatus) {
  const normalizedCurrent = String(currentStatus || "").trim();
  const normalizedNext = String(nextStatus || "").trim();

  if (!normalizedCurrent || !normalizedNext || normalizedCurrent === normalizedNext) {
    return false;
  }

  return getAllowedStatusTransitions(normalizedCurrent).includes(normalizedNext);
}

export function getMilestoneUpdates(nextStatus, effectiveDate) {
  const updates = {};
  const resolvedDate = effectiveDate || new Date().toISOString().slice(0, 10);
  if (nextStatus === "scheduled") updates.install_scheduled_at = resolvedDate;
  if (nextStatus === "install_completed") updates.install_completed_at = resolvedDate;
  if (nextStatus === "pto_submitted") updates.pto_submitted_at = resolvedDate;
  if (nextStatus === "pto_granted") updates.pto_granted_at = resolvedDate;
  return updates;
}

export function promoteStatusFromMilestones(currentStatus, milestones = {}) {
  const normalizedCurrent = String(currentStatus || "").trim();
  if (!normalizedCurrent || ["on_hold", "cancelled", "paid_in_full"].includes(normalizedCurrent)) {
    return null;
  }

  const targetStatus = milestones.ptoGrantedAt
    ? "pto_granted"
    : milestones.ptoSubmittedAt
      ? "pto_submitted"
      : milestones.installCompletedAt
        ? "install_completed"
        : milestones.installScheduledAt
          ? "scheduled"
          : null;

  if (!targetStatus) return null;

  const currentIndex = LINEAR_STATUS_OPTIONS.indexOf(normalizedCurrent);
  const targetIndex = LINEAR_STATUS_OPTIONS.indexOf(targetStatus);
  if (currentIndex === -1 || targetIndex === -1 || currentIndex >= targetIndex) {
    return null;
  }

  return targetStatus;
}

export function getWorkflowAdvanceAction(job, source = "Workflow shortcut") {
  const currentStatus = String(job?.currentStatus || "").trim();
  const effectiveDate = new Date().toISOString().slice(0, 10);

  switch (currentStatus) {
    case "created":
      return {
        label: "Schedule install",
        shortLabel: "Schedule",
        toStatus: "scheduled",
        effectiveDate,
        note: `${source}: install scheduled`,
        description: "Move the job into the install queue.",
      };
    case "scheduled":
      return {
        label: "Mark install complete",
        shortLabel: "Install done",
        toStatus: "install_completed",
        effectiveDate,
        note: `${source}: install completed`,
        description: "Push the job into post-install workflow.",
      };
    case "install_completed":
      return {
        label: "Schedule inspection",
        shortLabel: "Inspection",
        toStatus: "inspection_scheduled",
        effectiveDate,
        note: `${source}: inspection scheduled`,
        description: "Move the job into inspection follow-through.",
      };
    case "inspection_scheduled":
      return {
        label: "Mark inspection passed",
        shortLabel: "Passed",
        toStatus: "inspection_passed",
        effectiveDate,
        note: `${source}: inspection passed`,
        description: "Advance the job to PTO preparation.",
      };
    case "inspection_failed":
      return {
        label: "Reschedule inspection",
        shortLabel: "Reschedule",
        toStatus: "inspection_scheduled",
        effectiveDate,
        note: `${source}: inspection rescheduled`,
        description: "Move the job back into the inspection queue.",
      };
    case "inspection_passed":
      return {
        label: "Submit PTO",
        shortLabel: "Submit PTO",
        toStatus: "pto_submitted",
        effectiveDate,
        note: `${source}: PTO submitted`,
        description: "Start the utility approval step.",
      };
    case "pto_submitted":
      return {
        label: "Grant PTO",
        shortLabel: "Grant PTO",
        toStatus: "pto_granted",
        effectiveDate,
        note: `${source}: PTO granted`,
        description: "Move the job into final billing readiness.",
      };
    default:
      return null;
  }
}
