// /api/reservations/import — Konaklama DOSYA (xlsx/csv) içe aktarma
// İki fazlı sözleşme (REG-IO / CC-IMPORT deseni):
//   1) commit !== true → PREVIEW: normalize + doğrulama + stok planı; HİÇBİR YAZIM YOK.
//   2) commit === true → COMMIT: geçerli satırlar createManualReservation ile işlenir
//      (stok tüketimi + mükerrer çakışma + activity log invariant'ları korunur).
// Dosya istemcide parse edilir (SheetJS); sunucu aynı doğrulamayı yeniden koşar.
// Kiracı kapsamı verifyEditionTenant ile zorlanır — istemciye güvenilmez.
import { NextRequest, NextResponse } from "next/server";
import {
  previewReservationImport,
  commitReservationImport,
  MAX_RES_IMPORT_ROWS,
} from "@/lib/api/reservation-import";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

const DEFAULT_STATUSES = ["REQUESTED", "WAITLIST", "RESERVED", "CONFIRMED"] as const;

export async function POST(req: NextRequest) {
  // toplu yazım kapısı — 10 istek/dk/IP
  const denied = enforceRateLimit(req, { key: "res-import", limit: 10, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as {
      editionId?: string;
      rows?: Record<string, unknown>[];
      commit?: boolean;
      defaultStatus?: string;
      onStockShortage?: string;
    };
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length === 0) return NextResponse.json({ error: "İçe aktarılacak satır yok" }, { status: 400 });
    if (rawRows.length > MAX_RES_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Tek istekte en fazla ${MAX_RES_IMPORT_ROWS} satır içe aktarılabilir (gönderilen: ${rawRows.length})` },
        { status: 413 },
      );
    }
    const defaultStatus =
      typeof body.defaultStatus === "string" && (DEFAULT_STATUSES as readonly string[]).includes(body.defaultStatus)
        ? body.defaultStatus
        : null;

    const onStockShortage = body.onStockShortage === "WAITLIST" ? "WAITLIST" as const : "reject" as const;

    // ── PREVIEW: yazım yok ──
    if (body.commit !== true) {
      const preview = await previewReservationImport({ editionId, rows: rawRows, defaultStatus });
      return NextResponse.json(preview);
    }

    // ── COMMIT ──
    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }
    const result = await commitReservationImport({ editionId, rows: rawRows, defaultStatus, onStockShortage, actorName });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    console.error("POST /api/reservations/import", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Rezervasyon içe aktarma tamamlanamadı" }, { status: 500 });
  }
}
