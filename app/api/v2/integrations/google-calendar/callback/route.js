import { NextResponse } from "next/server";
import { getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import {
  encryptSecret,
  exchangeGoogleCodeForTokens,
  getGoogleCalendarConnection,
  isGoogleCalendarInstalled,
  listCalendarsForConnection,
  upsertGoogleCalendarConnection,
  verifyGoogleOAuthState,
} from "@/lib/google-calendar";

function buildRedirect(req, searchParams) {
  const url = new URL("/settings", req.url);
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const error = searchParams.get("error");
    if (error) {
      return NextResponse.redirect(buildRedirect(req, { googleCalendarError: error }));
    }

    const code = searchParams.get("code");
    const stateToken = searchParams.get("state");
    if (!code || !stateToken) {
      return NextResponse.redirect(buildRedirect(req, { googleCalendarError: "Missing OAuth code or state" }));
    }

    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }

    const installed = await isGoogleCalendarInstalled(ctx.sql);
    if (!installed) {
      return NextResponse.redirect(buildRedirect(req, { googleCalendarError: "Apply db/migrations/006_google_calendar_sync.sql first." }));
    }

    const state = verifyGoogleOAuthState(stateToken);
    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company || state.companyId !== company.id) {
      return NextResponse.redirect(buildRedirect(req, { googleCalendarError: "Google Calendar callback did not match the current company." }));
    }

    const existingConnection = await getGoogleCalendarConnection(ctx.sql, company.id);
    const tokenData = await exchangeGoogleCodeForTokens(code, req);
    if (!tokenData.refresh_token && !existingConnection?.refresh_token_encrypted) {
      return NextResponse.redirect(buildRedirect(req, { googleCalendarError: "Google did not return a refresh token. Reconnect and approve offline access." }));
    }

    const provisionalConnection = {
      refresh_token_encrypted: tokenData.refresh_token
        ? encryptSecret(tokenData.refresh_token)
        : existingConnection.refresh_token_encrypted,
      calendar_id: existingConnection?.calendar_id || "primary",
    };

    const calendars = await listCalendarsForConnection(provisionalConnection, req);
    const selectedCalendar =
      calendars.find((item) => item.id === existingConnection?.calendar_id)
      || calendars.find((item) => item.primary)
      || calendars[0]
      || null;

    const connectedEmail =
      calendars.find((item) => item.primary)?.id
      || selectedCalendar?.id
      || existingConnection?.connected_email
      || null;

    await upsertGoogleCalendarConnection(ctx.sql, company.id, {
      calendarId: selectedCalendar?.id || existingConnection?.calendar_id || "primary",
      calendarSummary: selectedCalendar?.summary || existingConnection?.calendar_summary || "Primary calendar",
      connectedEmail,
      refreshTokenEncrypted: tokenData.refresh_token
        ? encryptSecret(tokenData.refresh_token)
        : existingConnection.refresh_token_encrypted,
      scopes: tokenData.scope || existingConnection?.scopes || "",
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + (Number(tokenData.expires_in) * 1000)).toISOString() : null,
      lastSyncedAt: existingConnection?.last_synced_at || null,
      lastSyncStatus: existingConnection?.last_sync_status || null,
      lastSyncError: null,
      createdBy: ctx.appUser?.id || null,
      updatedBy: ctx.appUser?.id || null,
    });

    return NextResponse.redirect(buildRedirect(req, { googleCalendar: "connected" }));
  } catch (error) {
    return NextResponse.redirect(buildRedirect(req, { googleCalendarError: error.message || "Google Calendar connection failed" }));
  }
}
