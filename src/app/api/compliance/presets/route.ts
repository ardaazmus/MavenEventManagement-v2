// /api/compliance/presets — Yargı Profili Hazır Ayarları (TASK-B 18)
// GET : TR / EU hazır ayar nesneleri — YALNIZ sayı ve enum'lar; HUKUK METNİ TAŞIMAZ.
// POST: { jurisdiction: "TR" | "EU" } → hazır ayarı kiracı profiline uygular (upsert + update).
//       CUSTOM hazır ayar değildir — profilde elle yapılandırılır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

export interface JurisdictionPreset {
  jurisdiction: "TR" | "EU";
  dsrSlaDays: number;
  breachWindowHours: number;
  opLogYears: number;
  cookieStrictness: "STRICT" | "OPT_OUT";
  dpoMode: boolean;
  transferMechanism: "BOARD_AUTHORIZATION" | "SCC" | "ADEQUACY";
}

// TR: KVKK — KV veri sorumlusu temsil zorunlu değil; aktarım Kurul izniyle.
// EU: GDPR — VKT/DPO modu açık; aktarım standart sözleşme (SCC) mekanizmasıyla.
const PRESETS: Record<"TR" | "EU", JurisdictionPreset> = {
  TR: {
    jurisdiction: "TR",
    dsrSlaDays: 30,
    breachWindowHours: 72,
    opLogYears: 3,
    cookieStrictness: "STRICT",
    dpoMode: false,
    transferMechanism: "BOARD_AUTHORIZATION",
  },
  EU: {
    jurisdiction: "EU",
    dsrSlaDays: 30,
    breachWindowHours: 72,
    opLogYears: 3,
    cookieStrictness: "STRICT",
    dpoMode: true,
    transferMechanism: "SCC",
  },
};

export async function GET() {
  return NextResponse.json(PRESETS);
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    const body = (await req.json().catch(() => null)) as { jurisdiction?: string } | null;
    const key = body?.jurisdiction;
    if (key !== "TR" && key !== "EU") {
      return NextResponse.json({ error: "jurisdiction TR veya EU olmalı (CUSTOM hazır ayar içermez)" }, { status: 422 });
    }
    const preset = PRESETS[key];
    const profile = await db.jurisdictionProfile.upsert({
      where: { tenantId },
      update: { ...preset },
      create: { tenantId, ...preset },
    });
    // op-log — kişisel veri yok (yalnız hazır ayar adı)
    await db.activityLog
      .create({
        data: {
          tenantId,
          type: "OTHER",
          message: `Yargı profili güncellendi (${key} hazır ayarı)`,
          entityType: "JurisdictionProfile",
          entityId: profile.id,
          actorName: "Uyumluluk Modülü",
        },
      })
      .catch(() => undefined);
    return NextResponse.json(profile);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/compliance/presets", e);
    return NextResponse.json({ error: "Hazır ayar uygulanamadı" }, { status: 500 });
  }
}
