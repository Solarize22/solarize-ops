import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@/lib/users";
import { getSql } from "@/lib/db";

export async function hasTable(sql, tableName) {
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

export async function hasColumn(sql, tableName, columnName) {
  const rows = await sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as present
  `;
  return !!rows[0]?.present;
}

function mapNormalizedUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    clerkId: row.clerk_user_id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    status: row.is_active ? "active" : "inactive",
  };
}

async function getCompanyById(sql, companyId) {
  if (!companyId) return null;
  const rows = await sql`
    select id, name
    from companies
    where id = ${companyId}
    limit 1
  `;
  return rows[0] || null;
}

async function getSingleCompany(sql) {
  const rows = await sql`
    select id, name
    from companies
    order by created_at asc
    limit 2
  `;
  return rows.length === 1 ? rows[0] : null;
}

async function findNormalizedUser(sql, clerkUserId, email) {
  const appUsersExists = await hasTable(sql, "app_users");
  if (!appUsersExists) return null;

  const rows = await sql`
    select *
    from app_users
    where clerk_user_id = ${clerkUserId}
       or lower(email) = lower(${email || ""})
    order by
      case when clerk_user_id = ${clerkUserId} then 0 else 1 end asc,
      created_at asc
  `;

  if (!rows.length) return null;

  const clerkMatch = rows.find((row) => row.clerk_user_id === clerkUserId);
  if (clerkMatch) return mapNormalizedUser(clerkMatch);

  const normalizedEmail = String(email || "").trim().toLowerCase();
  const emailMatches = rows.filter((row) => String(row.email || "").trim().toLowerCase() === normalizedEmail);
  if (emailMatches.length === 1) {
    return mapNormalizedUser(emailMatches[0]);
  }

  return null;
}

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "salesperson") return "sales";
  return role || "ops";
}

function preferredRole(email, fallbackUser, existingRole) {
  const ownerEmails = (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (email && ownerEmails.includes(String(email).toLowerCase())) {
    return "owner";
  }

  return normalizeRole(fallbackUser?.role || existingRole || "ops");
}

async function ensureNormalizedUser(sql, clerkUserId, email, name, fallbackUser, normalizedUser) {
  const appUsersExists = await hasTable(sql, "app_users");
  if (!appUsersExists) return null;

  const company =
    await getCompanyById(sql, normalizedUser?.companyId)
    || await getSingleCompany(sql);
  if (!company) return null;

  const existingRows = await sql`
    select *
    from app_users
    where company_id = ${company.id}
      and (
        clerk_user_id = ${clerkUserId}
        or lower(email) = lower(${email || ""})
      )
    order by
      case when clerk_user_id = ${clerkUserId} then 0 else 1 end asc,
      created_at asc
    limit 1
  `;

  const existing = existingRows[0] || null;
  const role = preferredRole(email, fallbackUser, existing?.role);

  let row;

  if (existing) {
    const rows = await sql`
      update app_users
      set
        clerk_user_id = ${clerkUserId},
        email = ${email || existing.email || ""},
        full_name = ${name || existing.full_name || "User"},
        role = ${role}::company_role,
        is_active = true,
        updated_at = now()
      where id = ${existing.id}
      returning *
    `;
    row = rows[0];
  } else {
    const rows = await sql`
      insert into app_users (
        company_id,
        clerk_user_id,
        email,
        full_name,
        role,
        is_active,
        created_at,
        updated_at
      )
      values (
        ${company.id},
        ${clerkUserId},
        ${email || ""},
        ${name || "User"},
        ${role}::company_role,
        true,
        now(),
        now()
      )
      returning *
    `;
    row = rows[0];
  }

  return mapNormalizedUser(row);
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
  const fallbackUser = normalizedUser || await getOrCreateUser(userId, { email, name });
  const appUser = await ensureNormalizedUser(sql, userId, email, name, fallbackUser, normalizedUser) || normalizedUser || fallbackUser;

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
  return isOwner(appUser) || isAdmin(appUser);
}

export function canManageJobOperations(appUser) {
  return isOwner(appUser) || isAdmin(appUser) || appUser?.role === "ops";
}

export function canCreateInvoices(appUser) {
  return isOwner(appUser) || isAdmin(appUser);
}

export function canRecordPayments(appUser) {
  return isOwner(appUser) || isAdmin(appUser);
}

export async function getNormalizedCompany(sql, appUser = null) {
  if (appUser?.companyId) {
    return getCompanyById(sql, appUser.companyId);
  }

  return getSingleCompany(sql);
}

export async function findCompanyUserById(sql, companyId, userId, options = {}) {
  if (!companyId || !userId) return null;

  const { activeOnly = true, roles = null } = options;
  const rows = await sql`
    select id, company_id, full_name, email, role, is_active
    from app_users
    where company_id = ${companyId}
      and id = ${userId}
    limit 1
  `;

  const user = rows[0] || null;
  if (!user) return null;
  if (activeOnly && !user.is_active) return null;
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) return null;

  return mapNormalizedUser(user);
}

export async function ensureAccessToJob(sql, jobId, appUser) {
  const company = await getNormalizedCompany(sql, appUser);
  if (!company) return null;

  const jobs = await sql`
    select
      j.id,
      j.job_number,
      j.company_id,
      j.customer_name,
      j.current_status,
      exists(
        select 1
        from job_crew_assignments a
        where a.job_id = j.id
          and a.user_id = ${appUser?.id || null}
      ) as is_assigned
    from jobs j
    where (j.id::text = ${jobId} or j.job_number = ${jobId})
      and j.company_id = ${company.id}
    limit 1
  `;

  const job = jobs[0];
  if (!job) return null;
  if (appUser?.role === "installer" && !job.is_assigned) return false;
  return job;
}
