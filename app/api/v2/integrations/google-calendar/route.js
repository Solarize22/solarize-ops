import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import {
  getGoogleCalendarConfigStatus,
  getGoogleCalendarConnection,
  isGoogleCalendarInstalled,
  listCalendarsForConnection,
  mapGoogleConnection,
  updateGoogleCalendarConnection,
  disconnectGoogleCalendar,
} from "@/lib/google-calendar";

export async function GET(req) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    const config = getGoogleCalendarConfigStatus(req);
    if (!company) {
      return NextResponse.json({
        installed: false,
        configReady: config.ready,
        missing: config.missing,
        redirectUri: config.redirectUri,
        appBaseUrl: config.appBaseUrl,
        scope: config.scope,
        timezone: config.timezone,
        connected: false,
        connection: null,
        availableCalendars: [],
        linkedEventCount: 0,
      });
    }

    const installed = await isGoogleCalendarInstalled(ctx.sql);
    if (!installed) {
      return NextResponse.json({
        installed: false,
        configReady: config.ready,
        missing: config.missing,
        redirectUri: config.redirectUri,
        appBaseUrl: config.appBaseUrl,
        scope: config.scope,
        timezone: config.timezone,
        connected: false,
        connection: null,
        availableCalendars: [],
        linkedEventCount: 0,
      });
    }

    const connection = await getGoogleCalendarConnection(ctx.sql, company.id);
    const countRows = await ctx.sql`
      select count(*)::int as count
      from google_calendar_event_links
      where company_id = ${company.id}
    `;

    let availableCalendars = [];
    if (connection && config.ready) {
      try {
        availableCalendars = await listCalendarsForConnection(connection, req);
      } catch (error) {
        availableCalendars = [];
      }
    }

    return NextResponse.json({
      installed: true,
      configReady: config.ready,
      missing: config.missing,
      redirectUri: config.redirectUri,
      appBaseUrl: config.appBaseUrl,
      scope: config.scope,
      timezone: config.timezone,
      connected: !!connection,
      connection: mapGoogleConnection(connection),
      availableCalendars,
      linkedEventCount: countRows[0]?.count || 0,
      canManage: canManageJobOperations(ctx.appUser),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load Google Calendar integration" }, { status: 500 });
  }
}

export async function PATCH(req) {
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

    const installed = await isGoogleCalendarInstalled(ctx.sql);
    if (!installed) {
      return NextResponse.json({ error: "Apply db/migrations/006_google_calendar_sync.sql first." }, { status: 409 });
    }

    const connection = await getGoogleCalendarConnection(ctx.sql, company.id);
    if (!connection) {
      return NextResponse.json({ error: "Google Calendar is not connected yet." }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const calendarId = String(body?.calendarId || "").trim();
    if (!calendarId) {
      return NextResponse.json({ error: "calendarId is required" }, { status: 400 });
    }

    const calendars = await listCalendarsForConnection(connection, req);
    const selected = calendars.find((item) => item.id === calendarId);
    if (!selected) {
      return NextResponse.json({ error: "Selected calendar was not found on the connected Google account." }, { status: 400 });
    }

    const updated = await updateGoogleCalendarConnection(ctx.sql, company.id, {
      calendarId: selected.id,
      calendarSummary: selected.summary,
      updatedBy: ctx.appUser?.id || null,
    });

    return NextResponse.json({
      connected: true,
      connection: mapGoogleConnection(updated),
      availableCalendars: calendars.map((item) => ({
        ...item,
        selected: item.id === selected.id,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to update Google Calendar settings" }, { status: 500 });
  }
}

export async function DELETE() {
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
      return NextResponse.json({ ok: true });
    }

    const installed = await isGoogleCalendarInstalled(ctx.sql);
    if (!installed) {
      return NextResponse.json({ ok: true });
    }

    await disconnectGoogleCalendar(ctx.sql, company.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to disconnect Google Calendar" }, { status: 500 });
  }
}
