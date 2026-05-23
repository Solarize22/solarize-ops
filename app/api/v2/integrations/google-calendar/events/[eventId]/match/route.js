import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { manuallyMatchImportedGoogleEvent } from "@/lib/google-calendar";

export async function PATCH(req, { params }) {
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

    const body = await req.json().catch(() => ({}));
    const result = await manuallyMatchImportedGoogleEvent(ctx.sql, company, ctx.appUser, params.eventId, {
      sourceType: body?.sourceType,
      jobId: body?.jobId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to match Google Calendar event" }, { status: 500 });
  }
}
