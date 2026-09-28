// Sertifika Baskı Sayfası — custom boyut + arka plan layer + kişi-özel metin (düşünce bulutu 9)
// POST /api/certificates/print-sheet { editionId, definitionId, participationIds[] }
// Yer tutucular: {{fullName}} {{title}} {{company}} {{edition}} {{type}} {{date}} {{serial}} {{tier}}
// R10-b: def.designJson varsa elemanlar mm cinsinden mutlak konumlu div'ler olarak basılır
//        (kanvas tasarımcısıyla aynı yerleşim); yoksa bodyTemplate fallback devam eder.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { BADGE_FONTS } from "@/lib/constants";
import QRCode from "qrcode";

// kanvas eleman modeli — onsite.tsx CertElement ile aynı sözleşme
interface DesignElement {
  id?: string;
  type?: string; // text | image | line | qr
  x?: number; y?: number; w?: number; h?: number; // mm
  text?: string; fontSize?: number; fontWeight?: number; color?: string; align?: string;
  imageDataUrl?: string; radius?: number;
}

function parseDesign(json: string | null | undefined): DesignElement[] {
  try {
    const arr = json ? (JSON.parse(json) as DesignElement[]) : [];
    return Array.isArray(arr) ? arr.filter((e) => e && typeof e.x === "number" && typeof e.y === "number") : [];
  } catch { return []; }
}

// mm değerlerini güvenli yaz (CSS mm birimi doğrudan kullanılır — baskıda 1mm=1mm)
const mm = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

export async function POST(req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const body = (await req.json()) as { editionId?: string; definitionId?: string; participationIds?: string[] };
    if (!body.editionId || !body.definitionId || !body.participationIds?.length) {
      return NextResponse.json({ error: "editionId, definitionId ve participationIds zorunlu" }, { status: 400 });
    }
    // G0-b: sertifika kişi verisi basar — edisyon + tanım bağlamı doğrulanır
    try {
      await resolveEditionContext(body.editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
    const def = await db.certificateDefinition.findUnique({ where: { id: body.definitionId } });
    if (!def) return NextResponse.json({ error: "Sertifika tanımı bulunamadı" }, { status: 404 });
    if (def.editionId !== body.editionId) {
      // tanım başka edisyona/kiraciya ait — varlık ifşa edilmez
      return NextResponse.json({ error: "Sertifika tanımı bulunamadı" }, { status: 404 });
    }
    const edition = await db.eventEdition.findUnique({ where: { id: body.editionId }, include: { series: true } });
    if (!edition) return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });

    const font = BADGE_FONTS[def.fontKey]?.css ?? "Georgia, serif";
    const totalW = def.widthMm + def.bleedMm * 2;
    const totalH = def.heightMm + def.bleedMm * 2;
    const dateStr = edition.startDate ? edition.startDate.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("tr-TR");

    const issues = await db.certificateIssue.findMany({
      where: { definitionId: def.id, participationId: { in: body.participationIds } },
      include: {
        participation: {
          include: {
            person: true, snapshots: true,
            registrations: { include: { category: true } },
            roleAssignments: true,
          },
        },
      },
    });

    const design = parseDesign(def.designJson); // R10-b: kanvas tasarımı (boşsa bodyTemplate fallback)

    const pages = await Promise.all(issues.map(async (issue, i) => {
      const person = issue.participation.person;
      const snap = issue.participation.snapshots[issue.participation.snapshots.length - 1];
      // P4: geçerli kayıt deterministik (P3.11 kuralı — registrations[0] sırasız)
      const regs = [...issue.participation.registrations].sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
      const reg = regs.find((r) => r.status === "CONFIRMED") ?? regs[0];
      const roles = issue.participation.roleAssignments.map((r) => r.role).join(", ");
      const serial = `${def.type.slice(0, 3).toUpperCase()}-${(reg?.confirmationNo ?? issue.id).slice(-6).toUpperCase()}`;
      // P4 (yeni-fazlar 16): şablon DEĞERLERİ HTML bağlamından kaçırılır (ad/şirket/rol/
      // kurum adları kullanıcı-kontrolü) — şablon özelliği korunur; satır sonu davranışı
      // aynen sürer (escape SONRASI \n→<br/> dönüşümü).
      const esc = (v: string) => escapeHtml(String(v ?? ""));
      const fill = (s: string) => (s ?? "")
        .replace(/\{\{fullName\}\}/g, esc(`${person.firstName} ${person.lastName}`))
        .replace(/\{\{title\}\}/g, esc(snap?.title ?? person.title ?? ""))
        .replace(/\{\{company\}\}/g, esc(snap?.company ?? person.company ?? ""))
        .replace(/\{\{edition\}\}/g, esc(edition.name + (edition.editionLabel ? ` — ${edition.editionLabel}` : "")))
        .replace(/\{\{series\}\}/g, esc(edition.series?.name ?? "Maven"))
        .replace(/\{\{type\}\}/g, esc(def.name))
        .replace(/\{\{tier\}\}/g, esc(reg?.category?.name ?? def.tierNote ?? ""))
        .replace(/\{\{date\}\}/g, esc(dateStr))
        .replace(/\{\{serial\}\}/g, esc(serial))
        .replace(/\{\{roles\}\}/g, esc(roles))
        .replace(/\{\{signer\}\}/g, esc(def.signerName ?? ""))
        .replace(/\n/g, "<br/>");

      // R10-b: kanvas elemanları — mm mutlak konum; text/image/line/qr
      const elementsHtml = design.length > 0 ? (await Promise.all(design.map(async (el) => {
        const pos = `left:${mm(el.x)}mm;top:${mm(el.y)}mm;width:${mm(el.w)}mm;height:${mm(el.h)}mm;`;
        // P4: stil değerleri allowlist — CSS enjeksiyonu kapanır
        const colorHex = String(el.color ?? "1f2937").replace("#", "");
        const color = `#${/^[0-9a-fA-F]{3,8}$/.test(colorHex) ? colorHex : "1f2937"}`;
        const align = ["left", "center", "right"].includes(String(el.align)) ? String(el.align) : "left";
        if (el.type === "text") {
          const style = `${pos}font-size:${mm(el.fontSize ?? 4)}mm;font-weight:${mm(el.fontWeight ?? 400)};color:${color};text-align:${align};`;
          return `<div class="el" style="${style}">${fill(String(el.text ?? ""))}</div>`;
        }
        if (el.type === "line") {
          return `<div class="el" style="${pos}background:${color};opacity:.85;"></div>`;
        }
        if (el.type === "image" && typeof el.imageDataUrl === "string" && el.imageDataUrl.startsWith("data:image/")) {
          return `<div class="el" style="${pos}"><img src="${el.imageDataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:${mm(el.radius ?? 0)}mm;" alt="" /></div>`;
        }
        if (el.type === "qr") {
          // baskıda gerçek QR — seri numarası + kişi doğrulama özeti (badge print-sheet desenindeki qrcode paketi)
          const qrPayload = `MAVEN|${edition.name}|${serial}|${person.firstName} ${person.lastName}`;
          const qrData = await QRCode.toDataURL(qrPayload, { margin: 0, width: 320 });
          return `<div class="el" style="${pos}"><img src="${qrData}" style="width:100%;height:100%;" alt="QR" /></div>`;
        }
        return ""; // verisiz görsel alanı / bilinmeyen tür — baskıda sessizce atlanır
      }))).filter(Boolean).join("\n") : "";

      const bodyHtml = def.bodyTemplate
        ? fill(def.bodyTemplate)
        : `<p>Bu belge, <b>${fill("{{edition}}")}</b> etkinliğine <b>${fill("{{tier}}") || "katılımcı"}</b> olarak katılımını<br/> belgelemek üzere düzenlenmiştir.</p>`;

      const faceInner = design.length > 0
        ? elementsHtml
        : `<div class="brand">${fill("{{series}}")}</div>
        <div class="cert-title">${escapeHtml(def.name)}</div>
        <div class="cert-no">${serial}</div>
        <div class="cert-body">${bodyHtml}</div>
        <div class="sign-row">
          <div class="sign"><div class="sign-line"></div><div class="sign-name">${escapeHtml(def.signerName ?? "Yetkili")}</div><div class="sign-role">Organizasyon Sekreteri</div></div>
          <div class="seal"><span>MAVEN</span><small>${escapeHtml(fill("{{date}}"))}</small></div>
          <div class="sign"><div class="sign-line"></div><div class="sign-name">Akreditasyon</div><div class="sign-role">Bilimsel Komite</div></div>
        </div>`;

      return `
      <div class="cert" style="width:${totalW}mm;height:${totalH}mm;">
        <div class="face" style="border-radius:2mm;${def.backgroundDataUrl ? `background-image:url('${def.backgroundDataUrl}');` : "background:linear-gradient(150deg,#fffdf6 0%,#faf6ea 55%,#f1ead4 100%);"}color:#${def.textColor.replace("#", "")};">
          ${faceInner}
        </div>
      </div>`;
    }));

    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8" />
<title>${escapeHtml(def.name)} — ${escapeHtml(edition.name)}</title>
<style>
  @page { size: ${totalW}mm ${totalH}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${font}; background: #d1d5db; }
  .cert { page-break-after: always; position: relative; }
  .face { position: absolute; inset: ${def.bleedMm}mm; overflow: hidden; background-size: cover; background-position: center; display: flex; flex-direction: column; padding: 16mm 20mm; }
  .el { position: absolute; overflow: hidden; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .brand { text-align: center; font-size: 4mm; letter-spacing: 4px; text-transform: uppercase; opacity: .7; }
  .cert-title { text-align: center; font-size: 11mm; font-weight: 700; margin-top: 8mm; }
  .cert-no { text-align: center; font-family: monospace; font-size: 2.6mm; opacity: .55; margin-top: 2mm; }
  .cert-body { text-align: center; font-size: 4.4mm; line-height: 1.8; margin-top: 10mm; flex: 1; }
  .sign-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 10mm; }
  .sign { text-align: center; width: 42mm; }
  .sign-line { border-top: .4mm solid currentColor; margin-bottom: 2mm; opacity: .6; }
  .sign-name { font-size: 3.4mm; font-weight: 700; }
  .sign-role { font-size: 2.6mm; opacity: .65; }
  .seal { width: 26mm; height: 26mm; border: .8mm double currentColor; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 800; opacity: .85; }
  .seal small { font-size: 2.2mm; font-weight: 400; opacity: .8; }
  @media screen {
    body { padding: 8mm; padding-top: 52px; display: flex; flex-direction: column; gap: 6mm; align-items: center; }
    .cert { box-shadow: 0 2mm 8mm rgba(0,0,0,.3); }
    .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: #fff; padding: 8px 16px; font-family: system-ui; font-size: 13px; display: flex; gap: 12px; align-items: center; z-index: 99; }
    .toolbar button { background: #d4a017; border: 0; color: #1f1500; font-weight: 700; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  }
  @media print { .toolbar { display: none; } body { background: #fff; padding: 0; } }
</style></head><body>
<div class="toolbar"><span>${issues.length} sertifika · ${def.widthMm}×${def.heightMm}mm${def.bleedMm ? ` + ${def.bleedMm}mm baskı payı` : ""} · ${def.orientation}${design.length > 0 ? ` · kanvas yerleşimi (${design.length} eleman)` : ""}</span><button onclick="window.print()">🖨️ Yazdır / PDF kaydet</button></div>
${pages.join("\n")}
</body></html>`;

    // baskı sayfası üretimi durum günceller: ELIGIBLE → GENERATED
    const now = new Date();
    for (const issue of issues) {
      if (issue.status === "ELIGIBLE") {
        await db.certificateIssue.update({ where: { id: issue.id }, data: { status: "GENERATED", generatedAt: now } });
      }
    }

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sertifika sayfası üretilemedi" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
