// /api/registrations/manual — Admin MANUEL TEKİL kayıt (Kayıt & Katılımcılar modülü)
// Formlar üzerinden kayıt zaten akar (public-register); bu uç YÖNETİM yüzeyidir:
// e-postayla gelen tekil listeler, saha aramaları, telefonla gelen kayıtlar için
// detaylı tekil giriş. Zincir: Kişi → Katılım → Kayıt → (ücretli+kendi ödemesi) Sipariş/Ödeme
// — TEK transaction; mükerrer aktif kayıt 409; kategori kapasitesi tx-içi atomik (409).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createManualRegistration, ManualRegistrationError, MANUAL_STATUSES, MANUAL_FUNDING } from "@/lib/api/manual-registration";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withLock } from "@/lib/tx-lock";

export async function POST(req: NextRequest) {
  // S3: yönetim yazım kapısı — 30 istek/dk/IP
  const denied = enforceRateLimit(req, { key: "reg-manual", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });

    // bağlam kiracısı ≠ edisyon kiracısı / edisyon yok → GuardError (400/403/404)
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }

    // eşzamanlı manuel/içe-aktarma yazımlarını edisyon başına serileştir (kapasite yarışı)
    const result = await withLock(`regman:${editionId}`, () =>
      createManualRegistration({
        editionId,
        firstName: String(body.firstName ?? ""),
        lastName: String(body.lastName ?? ""),
        email: (body.email as string) || null,
        phone: (body.phone as string) || null,
        title: (body.title as string) || null,
        company: (body.company as string) || null,
        city: (body.city as string) || null,
        country: (body.country as string) || null,
        attendance: (body.attendance as string) || null,
        categoryId: (body.categoryId as string) || null,
        status: typeof body.status === "string" && (MANUAL_STATUSES as readonly string[]).includes(body.status) ? body.status : null,
        fundingSource: typeof body.fundingSource === "string" && (MANUAL_FUNDING as readonly string[]).includes(body.fundingSource) ? body.fundingSource : null,
        notes: (body.notes as string) || null,
        source: "ADMIN_ENTRY",
        actorName,
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ManualRegistrationError) {
      const status = e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "VALIDATION" || e.code === "CATEGORY" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code, detail: e.detail ?? null }, { status });
    }
    console.error("POST /api/registrations/manual", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Kayıt oluşturulamadı" }, { status: 500 });
  }
}
