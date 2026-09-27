// /api/compliance/jurisdiction — Yargı Profili (TASK-B 18)
// GET  : çözümlenen kiracı için profil YOKSA şema varsayılanlarıyla OLUŞTURULUP döner (read-or-create).
// PATCH: alan güncelleme — giriş doğrulaması KATI (enum kümeleri + eşikler);
//        ActivityLog "Yargı profili güncellendi" — mesaj KİŞİSEL VERİ İÇERMEZ (yalnız yapılandırma).
// Hukuk metni TAŞIMAZ: yalnız sayılar/enum'lar + serbest not (retentionNotes kullanıcı sorumluluğunda).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

const JURISDICTIONS = ["TR", "EU", "CUSTOM"] as const;
const BREACH_WINDOWS = [24, 72, 96] as const;
const COOKIE_STRICTNESS = ["STRICT", "OPT_OUT"] as const;
const TRANSFER_MECHANISMS = ["BOARD_AUTHORIZATION", "SCC", "ADEQUACY"] as const;

interface PatchBody {
  jurisdiction?: string;
  dsrSlaDays?: number;
  breachWindowHours?: number;
  opLogYears?: number;
  consentVersion?: string | null;
  cookieStrictness?: string;
  dpoMode?: boolean;
  transferMechanism?: string;
  retentionNotes?: string | null;
}

// Prisma update payload'ı — yalnız doğrulanan alanlar
interface ProfileUpdate {
  jurisdiction?: string;
  dsrSlaDays?: number;
  breachWindowHours?: number;
  opLogYears?: number;
  consentVersion?: string | null;
  cookieStrictness?: string;
  dpoMode?: boolean;
  transferMechanism?: string;
  retentionNotes?: string | null;
}

function fail(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 422 });
}

export async function GET() {
  try {
    const tenantId = await resolveContext(null);
    const profile = await db.jurisdictionProfile.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
    });
    return NextResponse.json(profile);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/compliance/jurisdiction", e);
    return NextResponse.json({ error: "Yargı profili okunamadı" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    const body = (await req.json().catch(() => null)) as PatchBody | null;
    if (!body || typeof body !== "object") return fail("Geçersiz istek gövdesi");

    const data: ProfileUpdate = {};

    if (body.jurisdiction !== undefined) {
      if (!(JURISDICTIONS as readonly string[]).includes(body.jurisdiction)) {
        return fail("jurisdiction değeri TR | EU | CUSTOM olmalı");
      }
      data.jurisdiction = body.jurisdiction;
    }

    if (body.dsrSlaDays !== undefined) {
      const n = Number(body.dsrSlaDays);
      if (!Number.isInteger(n) || n < 7 || n > 365) return fail("dsrSlaDays en az 7 olan bir tam sayı olmalı");
      data.dsrSlaDays = n;
    }

    if (body.breachWindowHours !== undefined) {
      const n = Number(body.breachWindowHours);
      if (!(BREACH_WINDOWS as readonly number[]).includes(n)) return fail("breachWindowHours 24, 72 veya 96 olmalı");
      data.breachWindowHours = n;
    }

    if (body.opLogYears !== undefined) {
      const n = Number(body.opLogYears);
      if (!Number.isInteger(n) || n < 1 || n > 10) return fail("opLogYears 1-10 arası bir tam sayı olmalı");
      data.opLogYears = n;
    }

    if (body.consentVersion !== undefined) {
      if (body.consentVersion === null) data.consentVersion = null;
      else {
        const v = body.consentVersion.trim();
        if (v.length > 80) return fail("consentVersion en fazla 80 karakter");
        data.consentVersion = v === "" ? null : v;
      }
    }

    if (body.cookieStrictness !== undefined) {
      if (!(COOKIE_STRICTNESS as readonly string[]).includes(body.cookieStrictness)) {
        return fail("cookieStrictness STRICT | OPT_OUT olmalı");
      }
      data.cookieStrictness = body.cookieStrictness;
    }

    if (body.dpoMode !== undefined) {
      if (typeof body.dpoMode !== "boolean") return fail("dpoMode boolean olmalı");
      data.dpoMode = body.dpoMode;
    }

    if (body.transferMechanism !== undefined) {
      if (!(TRANSFER_MECHANISMS as readonly string[]).includes(body.transferMechanism)) {
        return fail("transferMechanism BOARD_AUTHORIZATION | SCC | ADEQUACY olmalı");
      }
      data.transferMechanism = body.transferMechanism;
    }

    if (body.retentionNotes !== undefined) {
      if (body.retentionNotes === null) data.retentionNotes = null;
      else {
        const v = body.retentionNotes.trim();
        if (v.length > 2000) return fail("retentionNotes en fazla 2000 karakter");
        data.retentionNotes = v === "" ? null : v;
      }
    }

    if (Object.keys(data).length === 0) return fail("Güncellenecek geçerli alan yok");

    const profile = await db.jurisdictionProfile.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    // KVKK op-log (3 yıl saklama) — KİŞİSEL VERİ YOK: yalnız yapılandırma değişimi kaydı
    await db.activityLog
      .create({
        data: {
          tenantId,
          type: "OTHER",
          message: "Yargı profili güncellendi",
          entityType: "JurisdictionProfile",
          entityId: profile.id,
          actorName: "Uyumluluk Modülü",
        },
      })
      .catch(() => undefined);

    return NextResponse.json(profile);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/compliance/jurisdiction", e);
    return NextResponse.json({ error: "Yargı profili güncellenemedi" }, { status: 500 });
  }
}
