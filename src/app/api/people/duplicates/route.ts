// /api/people/duplicates — mükerrer kişi önerileri (Kimlik kuralı 1: e-posta güçlü işaret, kesin kimlik değil)
// GET /api/people/duplicates → { suggestions: [{ key, reason, persons: [...], dataPreview }] }
// Kurallar:
//   EMAIL      → normalize e-posta birebir aynı
//   NAME_PHONE → normalize ad+soyad aynı VE telefonun son 10 hanesi aynı
//   NAME_ORG   → normalize ad+soyad aynı VE kurum normalize aynı
// Birleştirme her zaman /api/flows { action: "person.merge" } ile onaylı yapılır (öneri ≠ birleştirme).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";

function norm(s: string | null | undefined): string {
  return (s ?? "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}
function normPhone(s: string | null | undefined): string {
  const digits = (s ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

export async function GET(req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    // G0-b: tarama bağlam kiracısıyla sınırlandırılır — başka kiracının adayları listelenmez
    const ctx = await resolveContext(null);
    const persons = await db.person.findMany({
      where: { status: { not: "MERGED" }, mergedIntoId: null, tenantId: ctx },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, title: true, company: true, city: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    void req;

    type P = (typeof persons)[number];
    const pairKey = (a: string, b: string) => [a, b].sort().join("::");

    const suggestions = new Map<string, { key: string; reason: string; persons: P[] }>();
    const add = (a: P, b: P, reason: string) => {
      const key = pairKey(a.id, b.id);
      if (!suggestions.has(key)) suggestions.set(key, { key, reason, persons: [a, b] });
    };

    // 1) e-posta eşleşmesi
    const byEmail = new Map<string, P[]>();
    for (const p of persons) {
      const e = norm(p.email);
      if (!e) continue;
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e)!.push(p);
    }
    for (const group of byEmail.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) add(group[i], group[j], "EMAIL");
      }
    }

    // 2) ad+soyad + telefon / kurum eşleşmesi
    const byName = new Map<string, P[]>();
    for (const p of persons) {
      const n = norm(`${p.firstName} ${p.lastName}`);
      if (!n) continue;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push(p);
    }
    for (const group of byName.values()) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i], b = group[j];
          if (suggestions.has(pairKey(a.id, b.id))) continue; // zaten e-posta ile önerildi
          const samePhone = normPhone(a.phone) !== "" && normPhone(a.phone) === normPhone(b.phone);
          const sameOrg = norm(a.company) !== "" && norm(a.company) === norm(b.company);
          if (samePhone) add(a, b, "NAME_PHONE");
          else if (sameOrg) add(a, b, "NAME_ORG");
        }
      }
    }

    const enriched = [...suggestions.values()].map((s) => {
      const [a, b] = s.persons;
      return {
        ...s,
        persons: s.persons.map((p) => ({
          id: p.id,
          fullName: `${p.firstName} ${p.lastName}`,
          email: p.email,
          phone: p.phone,
          title: p.title,
          company: p.company,
          city: p.city,
          status: p.status,
          createdAt: p.createdAt,
        })),
        // veri bolluğu önizlemesi: hedef seçiminde kullanıcıya yardımcı olur
        olderId: a.createdAt <= b.createdAt ? a.id : b.id,
        note: a.createdAt <= b.createdAt
          ? `${a.firstName} ${a.lastName} kaydı daha eski — hedef olarak önerilir`
          : `${b.firstName} ${b.lastName} kaydı daha eski — hedef olarak önerilir`,
      };
    });
    enriched.sort((x, y) => x.reason.localeCompare(y.reason) || x.persons[0].fullName.localeCompare(y.persons[0].fullName, "tr-TR"));

    return NextResponse.json({
      totalPersons: persons.length,
      suggestions: enriched,
      reasonLabels: { EMAIL: "Aynı e-posta", NAME_PHONE: "Aynı ad + telefon", NAME_ORG: "Aynı ad + kurum" },
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/people/duplicates", e);
    return NextResponse.json({ error: "Mükerrer taraması başarısız" }, { status: 500 });
  }
}
