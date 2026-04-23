import { hasTable } from "@/lib/normalized-api";

export async function isFieldTrackingInstalled(sql) {
  return hasTable(sql, "job_field_visits");
}

export function mapFieldVisitRow(row) {
  return {
    id: row.id,
    visitType: row.visit_type,
    status: row.status,
    visitDate: row.visit_date,
    completedAt: row.completed_at,
    installDayNumber: row.install_day_number,
    title: row.title,
    details: row.details,
    outcome: row.outcome,
    assignedUserId: row.assigned_user_id,
    assignedUserName: row.assigned_user_name,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
