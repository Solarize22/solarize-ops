import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { ensureImportBatchTables, listImportBatches } from "@/lib/import-batches";

export async function GET(req) {
  const ctx = await getRequestContext();
  if (!ctx.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageJobOperations(ctx.appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const company = await getNormalizedCompany(ctx.sql, ctx.appUser);
  if (!company) {
    return NextResponse.json({ error: "No company found" }, { status: 400 });
  }

  await ensureImportBatchTables(ctx.sql);

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  const limit = Number(searchParams.get("limit") || 5);
  const includeReverted = searchParams.get("includeReverted") === "true";

  const batches = await listImportBatches(ctx.sql, company.id, {
    source,
    limit,
    includeReverted,
  });

  return NextResponse.json(batches);
}
