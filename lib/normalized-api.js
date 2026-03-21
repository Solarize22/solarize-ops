import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@/lib/users";
import { getSql } from "@/lib/db";

async function hasTable(sql, tableName) {
  const rows = await sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as present
  `;
  return !!rows[0]?.present;
}

async function findNormalizedUser(sql, clerkUserId, email) {
  const appUsersExists = await hasTable(sql, "app_users");
  if (!appUsersExists) return null;

  const rows = await sql`
    select *
    from app_users
    where clerk_user_id = ${clerkUserId}
       or lower(email) = lower(${email || ""})
    order by created_at asc
    limit 1
  `;

  if (!rows.length) return null;

  return {
    id: rows[0].id,
    clerkId: rows[0].clerk_user_id,
    name: rows[0].full_name,
    email: rows[0].email,
    role: rows[0].role,
    status: rows[0].is_active ? "active" : "inactive",
  };
}

export async function getRequestContext() {
  const { userId } = await auth();
  if (!userId) {
    return { authenticated: false, userId: null, appUser: null, sql: null };
  }

  const sql = getSql();
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || "User";
  const normalizedUser = await findNormalizedUser(sql, userId, email);
  const appUser = normalizedUser || await getOrCreateUser(userId, { email, name });

  return {
    authenticated: true,
    userId,
    appUser,
    sql,
  };
}

export function isOwner(appUser) {
  return appUser?.role === "owner";
}

export function isAdmin(appUser) {
  return appUser?.role === "admin";
}

export function canSeeFinancials(appUser) {
  return isOwner(appUser);
}

export async function getNormalizedCompany(sql) {
  const rows = await sql`
    select id, name
    from companies
    order by created_at asc
    limit 1
  `;
  return rows[0] || null;
}

export async function ensureAccessToJob(sql, jobId, appUser) {
  const company = await getNormalizedCompany(sql);
  if (!company) return null;

  const jobs = await sql`
    select
      j.id,
      j.job_number,
      j.company_id,
      j.customer_name,
      exists(
        select 1
        from job_crew_assignments a
        join app_users u on u.id = a.user_id
        where a.job_id = j.id
          and lower(u.full_name) = lower(${appUser?.name || ""})
      ) as is_assigned
    from jobs j
    where j.id = ${jobId}
      and j.company_id = ${company.id}
    limit 1
  `;

  const job = jobs[0];
  if (!job) return null;
  if (appUser?.role === "installer" && !job.is_assigned) return false;
  return job;
}
