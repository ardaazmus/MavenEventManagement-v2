// /api/customer-contacts/import — Müşteri datasına DOSYA (xlsx/csv) içe aktarma
// İki fazlı sözleşme (REG-IO deseni):
//   1) commit !== true → PREVIEW: normalize + doğrulama + oluşturma/birleştirme planı;
//      HİÇBİR YAZIM YAPILMAZ.
//   2) commit === true → COMMIT: geçerli satırlar işlenir; e-posta/telefon eşleşen
//      kontak yeniden yaratılmaz — zenginleştirilir (birleştirme). Kısmi başarı meşrudur.
// Dosya istemcide parse edilir (SheetJS); sunucu aynı doğrulamayı yeniden koşar.
// Kiracı kapsamı sunucudan çözülür (resolveContext) — istemciye güvenilmez.
import { NextRequest, NextResponse } from "next/server";
import {
  previewContactImport,
  commitContactImport,
  MAX_IMPORT_ROWS,
} from "@/lib/api/customer-contact-import";
import { BroadcastError } from "@/lib/api/comms-broadcast";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveContext } from "@/lib/api/tenant-guard";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  // toplu yazım kapısı — 10 istek/dk/IP
  const denied = enforceRateLimit(req, { key: "cc-import", limit: 10, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as {
      rows?: Record<string, unknown>[];
      commit?: boolean;
      tag?: string;
    };
    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length === 0) return NextResponse.json({ error: "İçe aktarılacak satır yok" }, { status: 400 });
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `Tek istekte en fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir (gönderilen: ${rawRows.length})` },
        { status: 413 },
      );
    }

    const tenantId = await resolveContext(null);
    const tag = typeof body.tag === "string" && body.tag.trim() ? body.tag.trim().slice(0, 60) : null;

    // ── PREVIEW: yazım yok ──
    if (body.commit !== true) {
      const preview = await previewContactImport({ tenantId, rows: rawRows });
      return NextResponse.json(preview);
    }

    // ── COMMIT ──
    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }
    const result = await commitContactImport({ tenantId, rows: rawRows, tag, actorName });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof BroadcastError) {
      const status = e.code === "VALIDATION" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("POST /api/customer-contacts/import", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "İçe aktarma tamamlanamadı" }, { status: 500 });
  }
}
