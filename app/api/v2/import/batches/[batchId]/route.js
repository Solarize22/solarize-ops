import { NextResponse } from "next/server";
import { canManageJobOperations, getNormalizedCompany, getRequestContext } from "@/lib/normalized-api";
import { ensureImportBatchTables, getImportBatch, revertImportBatch } from "@/lib/import-batches";

export async function DELETE(_req, { params }) {
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

  const batchId = params?.batchId;
  if (!batchId) {
    return NextResponse.json({ error: "Missing import batch id" }, { status: 400 });
  }

  const batch = await getImportBatch(ctx.sql, company.id, batchId);
  if (!batch) {
    return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
  }

  try {
    const reverted = await revertImportBatch(ctx.sql, company.id, batchId);
    return NextResponse.json({
      ok: true,
      batch: reverted,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to revert import batch" }, { status: 400 });
  }
}
