import { hasTable } from "@/lib/normalized-api";

export async function isCrmInstalled(sql) {
  const [hasContactLog, hasTasks] = await Promise.all([
    hasTable(sql, "job_contact_log"),
    hasTable(sql, "job_follow_up_tasks"),
  ]);

  return hasContactLog && hasTasks;
}

export function emptyCrmPayload() {
  return {
    installed: false,
    summary: {
      lastContactAt: null,
      nextFollowUpAt: null,
      followUpOwnerId: null,
      followUpOwnerName: null,
      openTaskCount: 0,
      overdueTaskCount: 0,
    },
    contactLog: [],
    tasks: [],
  };
}

export function mapContactLogRow(row) {
  return {
    id: row.id,
    channel: row.contact_channel,
    direction: row.contact_direction,
    summary: row.summary,
    details: row.details,
    contactedAt: row.contacted_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
  };
}

export function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
  };
}
