// Yaka Kartı Baskı Sayfası — mm hassasiyetli, @page boyutlu (düşünce bulutu 8-bis)
// POST /api/badges/print-sheet { editionId, designId, participationIds[], copies? }
// Dönen: text/html — tarayıcıda "Yazdır → PDF olarak kaydet" ile tekil/toplu PDF
// Baskı payı (bleed) dahil sayfa boyutu; ön/arka yüz; QR (credential veya vCard); alan bağlama
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { BADGE_FONTS } from "@/lib/constants";

interface DesignElement {
  type: "TEXT" | "FIELD" | "QR" | "LOGO" | "SPONSOR_LOGO" | "PROGRAM" | "CONTACT";
  x: number; y: number; w: number; h: number;
  fontSize?: number; weight?: number; color?: string; align?: string;
  fieldKey?: string; text?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      editionId?: string; designId?: string; participationIds?: string[]; copies?: number;
    };
    if (!body.editionId || !body.designId || !body.participationIds?.length) {
      return NextResponse.json({ error: "editionId, designId ve participationIds zorunlu" }, { status: 400 });
    }
    const design = await db.badgeDesign.findUnique({ where: { id: body.designId } });
    if (!design) return NextResponse.json({ error: "Tasarım bulunamadı" }, { status: 404 });

    const edition = await db.eventEdition.findUnique({ where: { id: body.editionId }, include: { series: true } });
    if (!edition) return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });

    const font = BADGE_FONTS[design.fontKey]?.css ?? "Inter, sans-serif";
    const front: DesignElement[] = design.frontElements ? JSON.parse(design.frontElements) : [];
    const back: DesignElement[] = design.sideCount === 2 && design.backElements ? JSON.parse(design.backElements) : [];
    const copies = Math.max(1, Math.min(body.copies ?? 1, 4));

    // sponsor hiyerarşisi (arka yüz logo katmanı) — tier sırasına göre ilk eşleşen anlaşmalı kurum
    const sponsorLogos = design.sponsorHierarchyKey
      ? (await db.sponsorAgreement.findMany({
          where: { editionId: body.editionId, status: { in: ["CONTRACTED", "ACTIVE"] } },
          include: { organization: true, tier: true },
          take: 20,
        })).filter((a) => a.tier?.name?.toLocaleLowerCase("tr-TR") === design.sponsorHierarchyKey!.toLocaleLowerCase("tr-TR")).slice(0, 3)
      : [];

    // arka yüz programı — edisyonun ilk günündeki görünür oturumlar
    const programSessions = design.showProgramOnBack
      ? await db.programSession.findMany({
          where: { editionId: body.editionId, isVisible: true },
          orderBy: { startTime: "asc" },
          take: 6,
        })
      : [];

    const participations = await db.eventParticipation.findMany({
      where: { id: { in: body.participationIds }, editionId: body.editionId },
      include: {
        person: true,
        snapshots: true,
        registrations: { include: { category: true } },
        roleAssignments: true,
        badgeInstances: { include: { profile: true } },
        credentials: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const totalW = design.widthMm + design.bleedMm * 2;
    const totalH = design.heightMm + design.bleedMm * 2;

    const fieldVal = (key: string, p: (typeof participations)[number]): string => {
      const person = p.person;
      const snap = p.snapshots[p.snapshots.length - 1];
      const reg = p.registrations[0];
      switch (key) {
        case "fullName": return `${person.firstName} ${person.lastName}`;
        case "firstName": return person.firstName;
        case "lastName": return person.lastName;
        case "badgeName": return snap?.badgeName ?? `${person.firstName} ${person.lastName}`;
        case "title": return snap?.title ?? person.title ?? "";
        case "company": return snap?.company ?? person.company ?? "";
        case "country": return snap?.country ?? person.country ?? "";
        case "city": return person.city ?? "";
        case "role": return p.roleAssignments.map((r) => r.role).join(", ");
        case "profileName": return p.badgeInstances[0]?.profile?.name ?? "";
        case "accessAreas": return p.badgeInstances[0]?.profile?.accessAreas ?? "";
        case "badgeNo": return p.badgeInstances[0]?.badgeNo ?? "";
        case "confirmationNo": return reg?.confirmationNo ?? "";
        case "categoryName": return reg?.category?.name ?? "";
        default: return "";
      }
    };

    const renderElements = (els: DesignElement[], p: (typeof participations)[number], vcardQr: string, credentialQr: string) =>
      els.map((el, i) => {
        const base = `left:${el.x}mm;top:${el.y}mm;width:${el.w}mm;height:${el.h}mm;`;
        const text = `font-size:${el.fontSize ?? 3.2}mm;font-weight:${el.weight ?? 400};color:#${(el.color ?? "111827").replace("#", "")};text-align:${el.align ?? "left"};overflow:hidden;`;
        if (el.type === "QR") {
          const src = design.qrSource === "VCARD" ? vcardQr : credentialQr;
          return `<img src="${src}" style="${base}position:absolute;object-fit:contain;" alt="QR" />`;
        }
        if (el.type === "LOGO") {
          return `<div style="${base}position:absolute;display:flex;align-items:center;justify-content:${el.align ?? "center"};"><span style="font-weight:800;font-size:${el.fontSize ?? 4.5}mm;color:#${(el.color ?? "0f766e").replace("#", "")};letter-spacing:0.5px;">${edition.series?.name ?? "Maven"}</span></div>`;
        }
        if (el.type === "SPONSOR_LOGO") {
          const logo = sponsorLogos[0]?.organization?.logoUrl;
          if (!logo) return "";
          return `<img src="${logo}" style="${base}position:absolute;object-fit:contain;" alt="Sponsor" />`;
        }
        if (el.type === "PROGRAM") {
          if (programSessions.length === 0) return "";
          const items = programSessions.map((s) =>
            `<div style="font-size:2.1mm;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.startTime.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · ${s.title}</div>`).join("");
          return `<div style="${base}position:absolute;${text}">${items}</div>`;
        }
        if (el.type === "CONTACT") {
          return `<div style="${base}position:absolute;${text}white-space:pre-line;">${design.backContactInfo ?? ""}</div>`;
        }
        const value = el.type === "FIELD" ? fieldVal(el.fieldKey ?? "", p) : (el.text ?? "");
        return `<div style="${base}position:absolute;${text}display:flex;align-items:${el.type === "TEXT" ? "flex-start" : "center"};word-break:break-word;">${escapeHtml(value)}</div>`;
      }).join("");

    const cards: string[] = [];
    for (const p of participations) {
      const credential = p.credentials.find((c) => c.status === "ACTIVE") ?? p.credentials[0];
      const qrPayload = credential?.code ?? p.badgeInstances[0]?.badgeNo ?? "";
      const credentialQr = await QRCode.toDataURL(qrPayload || "MAVEN", { margin: 0, width: 320 });
      const vcardText = `BEGIN:VCARD\nVERSION:3.0\nN:${p.person.lastName};${p.person.firstName};;;\nFN:${p.person.firstName} ${p.person.lastName}\nORG:${p.person.company ?? ""}\nTITLE:${p.person.title ?? ""}\nEMAIL:${p.person.email ?? ""}\nTEL:${p.person.phone ?? ""}\nEND:VCARD`;
      const vcardQr = await QRCode.toDataURL(vcardText, { margin: 0, width: 320 });

      for (let c = 0; c < copies; c++) {
        const face = (side: "front" | "back") => `
          <div class="badge" style="width:${totalW}mm;height:${totalH}mm;">
            <div class="face" style="border-radius:${design.cornerMm}mm;
              ${side === "front"
                ? (design.frontBackgroundDataUrl ? `background-image:url('${design.frontBackgroundDataUrl}');` : "background:linear-gradient(160deg,#f8fafc 0%,#eef7f6 60%,#d9efec 100%);")
                : (design.backBackgroundDataUrl ? `background-image:url('${design.backBackgroundDataUrl}');` : "background:#ffffff;")}">
              ${side === "front" ? renderElements(front, p, vcardQr, credentialQr) : renderElements(back, p, vcardQr, credentialQr)}
              <span class="cut">${side === "front" ? "ÖN" : "ARKA"} · ${design.bleedMm}mm baskı payı</span>
            </div>
          </div>`;
        cards.push(face("front") + (design.sideCount === 2 ? face("back") : ""));
      }
    }

    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8" />
<title>Yaka Kartları — ${escapeHtml(edition.name)}</title>
<style>
  @page { size: ${totalW}mm ${totalH}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${font}; background: #e5e7eb; }
  .badge { page-break-after: always; position: relative; overflow: hidden; background: #fff; }
  .face { position: absolute; inset: ${design.bleedMm}mm; overflow: hidden; }
  .cut { position: absolute; right: 2mm; bottom: 1mm; font-size: 1.6mm; color: rgba(0,0,0,.28); font-family: monospace; }
  @media screen {
    body { padding: 8mm; display: flex; flex-wrap: wrap; gap: 6mm; }
    .badge { box-shadow: 0 2mm 6mm rgba(0,0,0,.25); page-break-after: auto; }
    .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #0f172a; color: #fff; padding: 8px 16px; font-family: system-ui; font-size: 13px; display: flex; gap: 12px; align-items: center; z-index: 99; }
    .toolbar button { background: #14b8a6; border: 0; color: #042f2e; font-weight: 700; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; }
    body { padding-top: 52px; }
  }
  @media print { .toolbar { display: none; } body { background: #fff; padding: 0; } }
</style></head><body>
<div class="toolbar"><span>${participations.length} katılımcı × ${copies} kopya · ${design.widthMm}×${design.heightMm}mm${design.bleedMm ? ` + ${design.bleedMm}mm baskı payı` : ""} · ${design.sideCount === 2 ? "çift" : "tek"} taraflı</span><button onclick="window.print()">🖨️ Yazdır / PDF kaydet</button></div>
${cards.join("\n")}
</body></html>`;

    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Baskı sayfası üretilemedi" }, { status: 500 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
