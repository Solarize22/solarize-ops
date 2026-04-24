import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { createGoogleOAuthState, getGoogleCalendarConfigStatus } from "@/lib/google-calendar";

export async function GET(req) {
  try {
    const ctx = await getRequestContext();
    if (!ctx.authenticated) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
    if (!canManageJobOperations(ctx.appUser)) {
      return NextResponse.redirect(new URL("/settings?googleCalendarError=forbidden", req.url));
    }

    const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
    if (!company) {
      return NextResponse.redirect(new URL("/settings?googleCalendarError=no-company", req.url));
    }

    const config = getGoogleCalendarConfigStatus(req);
    if (!config.ready) {
      return NextResponse.redirect(new URL(`/settings?googleCalendarError=${encodeURIComponent(`Missing ${config.missing.join(", ")}`)}`, req.url));
    }

    const state = createGoogleOAuthState({
      companyId: company.id,
      userId: ctx.appUser?.id || null,
      redirectTo: "/settings",
      exp: Date.now() + (10 * 60 * 1000),
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", config.scope);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.redirect(new URL(`/settings?googleCalendarError=${encodeURIComponent(error.message || "Failed to start Google Calendar connection")}`, req.url));
  }
}
