// /api/registrations/export — Kayıt & Katılımcılar dışa aktarma (Excel/xlsx)
// İki mod: normal (katılımcı listesi) + official (RESMİ KAYIT ONAY BELGESİ).
// P14.3b: üretim paylaşılan builder'da; doğrudan indirme 2000 satırla sınırlı —
// üzeri 403 + denetimli akış (/api/exports) yönlendirmesi. Rıza filtresi ve
// KVKK denetimi her iki yolda da çalışır (P14.2).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff, requestActor } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logExport } from "@/lib/privacy/export-guard";
import { buildRegistrationsXlsx } from "@/lib/exports/registrations-xlsx";

export const DIRECT_EXPORT_CAP = 2000;

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "reg-export", limit: 12, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId") ?? "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const status = sp.get("status") ?? "ALL";
    const q = (sp.get("q") ?? "").trim();
    const company = (sp.get("company") ?? "").trim();
    const official = sp.get("official") === "1";

    const out = await buildRegistrationsXlsx(db as never, {
      editionId,
      status,
      q,
      company,
      official,
      maxRows: DIRECT_EXPORT_CAP + 1,
    });
    if (out.count > DIRECT_EXPORT_CAP) {
      return NextResponse.json(
        { error: `Bu çıktı ${DIRECT_EXPORT_CAP} satırı aşıyor — denetimli akışı kullanın: POST /api/exports` },
        { status: 403 },
      );
    }

    const actor = await requestActor();
    const edition = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true } });
    await logExport(db, { tenantId: edition?.tenantId ?? null, editionId, type: "REGISTRATIONS", count: out.count, actorName: actor?.uid ?? null });

    return new NextResponse(new Uint8Array(out.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${out.filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(out.count),
      },
    });
  } catch (e) {
    console.error("GET /api/registrations/export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Dışa aktarma oluşturulamadı" }, { status: 500 });
  }
}
