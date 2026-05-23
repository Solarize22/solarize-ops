import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { getGoogleCalendarConfigStatus, pullGoogleCalendarIntoCrm, syncGoogleCalendarForCompany } from "@/lib/google-calendar";

export async function POST(req) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canManageJobOperations(ctx.appUser)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const config = getGoogleCalendarConfigStatus(req);
    if (!config.ready) {
      return NextResponse.json({ error: `Google Calendar is not configured: missing ${config.missing.join(", ")}` }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const direction = String(body?.direction || "push").trim().toLowerCase();

    let result;
    if (direction === "pull") {
      result = await pullGoogleCalendarIntoCrm(ctx.sql, company, ctx.appUser, req);
    } else {
      result = await syncGoogleCalendarForCompany(ctx.sql, company, ctx.appUser, req);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Google Calendar sync failed" }, { status: 500 });
  }
}
