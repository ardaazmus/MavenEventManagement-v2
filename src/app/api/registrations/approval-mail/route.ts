// /api/registrations/approval-mail — KURUM BAZLI TOPLU KAYIT ONAY E-POSTASI
// Kullanıcı ilkesi (Kayıt & Katılımcılar): firma/kurum/kuruluşlar "kayıtlarınız
// tamamlandı + son resmî onay" belgesini e-posta ile isteyebilir. Bu rota, seçilen
// kurum(lar)ın ONAYLANMIŞ kayıtlarını TEK kurum-bazlı mektupta birleştirir:
//   - mode:"preview" → hangi kurumun kaç onaylı kaydı var, e-postası var mı (yazım yok)
//   - mode:"send"    → her kuruma BİR e-posta (alıcı: Organization.generalEmail),
//                      içeriğinde katılımcı tablosu (ad, kategori, teyit no, durum)
// Kurum bağlantısı: OrganizationContact.personId → Organization (CRM kontak ilişişi;
// Person'da kurum skaleri yoktur — company serbest metindir, kimlik için kullanılmaz).
// Gönderim dispatchMail çekirdeğiyle (kota + bastırma + denetim logu ortak).
// Kiracı kapsamı verifyEditionTenant ile zorlanır; personel kapısı requireStaff.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dispatchMail } from "@/lib/mail-dispatch";

const MAX_ORGS_PER_SEND = 100;

interface ApprovalRow { name: string; category: string; confirmationNo: string }
interface OrgRow {
  organizationId: string;
  name: string;
  email: string | null;
  rows: ApprovalRow[];
}

async function collectOrganizations(editionId: string): Promise<OrgRow[]> {
  // 1) edisyondaki onaylı kayıtlar (tek sorgu, tablo satırlarıyla)
  const regs = await db.registration.findMany({
    where: { editionId, status: "CONFIRMED" },
    select: {
      confirmationNo: true,
      category: { select: { name: true } },
      participation: {
        select: {
          personId: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  if (regs.length === 0) return [];

  // 2) kişi → kurum (OrganizationContact.personId; ilk kontak kazanır).
  //    generalEmail öN FİLTRESİ YOK — e-postasız kurum da listelenir; önizlemede
  //    "tanımsız — seçilemez" olarak görünür, gönderimde net hata detayı döner.
  const personIds = [...new Set(regs.map((r) => r.participation.personId))];
  const contacts = await db.organizationContact.findMany({
    where: { personId: { in: personIds } },
    select: { personId: true, organization: { select: { id: true, name: true, generalEmail: true } } },
    orderBy: { isPrimary: "desc" },
  });
  const orgByPerson = new Map<string, { id: string; name: string; generalEmail: string | null }>();
  for (const c of contacts) {
    if (c.personId && !orgByPerson.has(c.personId)) orgByPerson.set(c.personId, c.organization);
  }

  // 3) kurum bazında grupla
  const map = new Map<string, OrgRow>();
  for (const r of regs) {
    const org = orgByPerson.get(r.participation.personId);
    if (!org) continue; // kurumsuz bireysel kayıtlar kurum mektubuna girmez
    const row = map.get(org.id) ?? { organizationId: org.id, name: org.name, email: org.generalEmail, rows: [] };
    row.rows.push({
      name: `${r.participation.person.firstName} ${r.participation.person.lastName}`.trim(),
      category: r.category?.name ?? "—",
      confirmationNo: r.confirmationNo,
    });
    map.set(org.id, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "reg-approval-mail", limit: 12, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as { editionId?: string; mode?: string; organizationIds?: string[] };
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const allOrgs = await collectOrganizations(editionId);

    // ── PREVIEW: yazım yok — kurum listesi + ulaşılabilirlik ──
    if (body.mode !== "send") {
      return NextResponse.json({
        mode: "preview",
        organizations: allOrgs.map(({ rows, ...o }) => ({ ...o, approvedCount: rows.length })),
      });
    }

    // ── SEND: yalnız istenen kurumlar, kurum başına BİR birleştirilmiş mektup ──
    const wanted = Array.isArray(body.organizationIds) ? body.organizationIds.slice(0, MAX_ORGS_PER_SEND) : [];
    if (wanted.length === 0) return NextResponse.json({ error: "Gönderilecek kurum seçilmedi" }, { status: 400 });

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }
    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, editionLabel: true, startDate: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    const tenant = await db.tenant.findFirst({ select: { name: true } });

    const dayFmt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "Europe/Istanbul" });
    const report: {
      mode: "send"; sent: number; failed: number; totalApproved: number;
      details: { organizationId: string; name: string; approvedCount: number; ok: boolean; error?: string }[];
    } = { mode: "send", sent: 0, failed: 0, totalApproved: 0, details: [] };

    for (const orgId of wanted) {
      const org = allOrgs.find((o) => o.organizationId === orgId);
      if (!org || org.rows.length === 0) {
        report.failed += 1;
        report.details.push({ organizationId: orgId, name: org?.name ?? "(bilinmeyen kurum)", approvedCount: 0, ok: false, error: "Kurumda onaylı kayıt yok" });
        continue;
      }
      if (!org.email) {
        report.failed += 1;
        report.details.push({ organizationId: org.organizationId, name: org.name, approvedCount: org.rows.length, ok: false, error: "Kurum genel e-postası tanımsız" });
        continue;
      }
      const rowsHtml = org.rows.map((r) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${r.category}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace">${r.confirmationNo}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">Onaylandı</td></tr>`,
      ).join("");
      const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:640px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 4px;font-size:20px">Kayıtlarınız tamamlandı — son resmî onay</h2>
  <p style="margin:0 0 16px;color:#475569;font-size:13px">${edition.name}${edition.editionLabel ? ` — ${edition.editionLabel}` : ""}${edition.startDate ? ` · ${dayFmt.format(new Date(edition.startDate))}` : ""}</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6">Sayın <b>${org.name}</b> yetkilisi,</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6">Kurumunuz adına yapılan kayıtlar tamamlandı ve organizasyon komitesi tarafından <b>kesin olarak onaylandı</b>. Aşağıdaki listede yer alan katılımcıların kayıt işlemleri sonuçlanmıştır; bu e-posta, kayıtlarınızın tamamlandığına dair <b>son resmî onay</b> niteliğindedir.</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
    <thead><tr style="background:#f1f5f9;text-align:left"><th style="padding:8px 10px">Katılımcı</th><th style="padding:8px 10px">Kategori</th><th style="padding:8px 10px">Teyit No</th><th style="padding:8px 10px">Durum</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin:16px 0 0;font-size:12px;color:#64748b">Toplam <b>${org.rows.length}</b> onaylı kayıt · Bu belge ${tenant?.name ?? "organizasyon"} tarafından elektronik olarak üretilmiştir.</p>
</div></body></html>`;
      const text = `Kayıtlarınız tamamlandı — son resmî onay\n\n${org.name} — ${org.rows.length} onaylı kayıt.\n${org.rows.map((r) => `- ${r.name} (${r.category}, ${r.confirmationNo})`).join("\n")}`;

      const out = await dispatchMail({
        recipients: [org.email],
        subject: `${edition.name} — Kayıtlarınız tamamlandı (son resmî onay)`,
        text,
        html,
      });
      if (out.ok && out.accepted.length > 0) {
        report.sent += 1;
        report.totalApproved += org.rows.length;
        report.details.push({ organizationId: org.organizationId, name: org.name, approvedCount: org.rows.length, ok: true });
        await db.activityLog.create({
          data: {
            editionId,
            type: "REGISTRATION_CONFIRMED",
            message: `Kurum onay postası gönderildi: ${org.name} — ${org.rows.length} onaylı kayıt (birleştirilmiş mektup)`,
            entityType: "Registration",
            actorName,
          },
        });
      } else {
        report.failed += 1;
        report.details.push({ organizationId: org.organizationId, name: org.name, approvedCount: org.rows.length, ok: false, error: out.error ?? "gönderim başarısız" });
      }
    }

    return NextResponse.json(report, { status: 200 });
  } catch (e) {
    console.error("POST /api/registrations/approval-mail", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Onay postası gönderilemedi" }, { status: 500 });
  }
}
