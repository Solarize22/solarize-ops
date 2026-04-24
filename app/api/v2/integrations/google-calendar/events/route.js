import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import {
  getGoogleCalendarConfigStatus,
  importGoogleCalendarEvents,
  isGoogleCalendarImportInstalled,
  isGoogleCalendarInstalled,
  listImportedGoogleCalendarEvents,
} from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) return NextResponse.json([]);

    const installed = await isGoogleCalendarInstalled(ctx.sql);
    const importInstalled = await isGoogleCalendarImportInstalled(ctx.sql);
    if (!installed || !importInstalled) {
      return NextResponse.json([]);
    }

    const events = await listImportedGoogleCalendarEvents(ctx.sql, company.id);
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load imported Google Calendar events" }, { status: 500 });
  }
}

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

    const result = await importGoogleCalendarEvents(ctx.sql, company, req, ctx.appUser);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to import Google Calendar events" }, { status: 500 });
  }
}
