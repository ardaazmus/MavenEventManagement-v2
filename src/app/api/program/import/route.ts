// Program & Katılımcı İçe Aktarım (düşünce bulutu 2)
// POST /api/program/import { editionId, kind: "SESSIONS"|"PARTICIPANTS", csvText, createMissingPersons?, defaultRoom? }
// Excel'den kopyala-yapıştır (TSV) veya CSV — başlık satırı esnek (tr/en eş anlamlı)
// Dönen rapor: satır sayısı, oluşturulan/güncellenen oturumlar, kişi eşleştirme dökümü
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

// basit CSV/TSV ayrıştırıcı — tırnaklı alanları destekler
function parseDelimited(text: string): string[][] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return [];
  const firstLine = clean.split("\n")[0];
  const sep = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/;/g)?.length ?? 0) ? "\t"
    : firstLine.includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(field.trim()); field = ""; }
    else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  row.push(field.trim()); rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

// başlık → standart alan eşlemesi
const HEADER_MAP: Record<string, string> = {
  title: "title", oturum: "title", "oturum adı": "title", başlık: "title", baslik: "title", "session title": "title", session: "title",
  type: "type", tür: "type", tur: "type", tip: "type",
  start: "start", başlangıç: "start", baslangic: "start", "start time": "start", saat: "start",
  end: "end", bitiş: "end", bitis: "end", "end time": "end",
  room: "room", salon: "room", "room name": "room",
  speaker: "speaker", konuşmacı: "speaker", konusmaci: "speaker", person: "speaker", kişi: "speaker", kisi: "speaker",
  email: "email", "e-posta": "email", eposta: "email", mail: "email",
  role: "role", rol: "role",
  company: "company", kurum: "company", firma: "company",
  name: "name", ad: "name", "ad soyad": "name", isim: "name",
};

function normDate(raw: string, base?: Date): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // "09:30" gibi yalnız saat — bugüne (veya base tarihine) bağla
  const t = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (t) {
    const b = base ?? new Date();
    const out = new Date(b);
    out.setHours(parseInt(t[1]), parseInt(t[2]), 0, 0);
    return out;
  }
  // dd.mm.yyyy hh:mm
  const m = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) {
    const year = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
    return new Date(year, parseInt(m[2]) - 1, parseInt(m[1]), m[4] ? parseInt(m[4]) : 9, m[5] ? parseInt(m[5]) : 0);
  }
  return null;
}

function normName(s: string) {
  return s.toLocaleLowerCase("tr-TR").replace(/[.,;:'"()]/g, "").replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      editionId?: string; kind?: string; csvText?: string;
      createMissingPersons?: boolean; createMissingRooms?: boolean; dryRun?: boolean;
    };
    const editionId = body.editionId;
    const kind = body.kind ?? "SESSIONS";
    if (!editionId || !body.csvText?.trim()) {
      return NextResponse.json({ error: "editionId ve csvText zorunlu" }, { status: 400 });
    }
    const edition = await db.eventEdition.findUnique({ where: { id: editionId } });
    if (!edition) return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });

    const rows = parseDelimited(body.csvText);
    if (rows.length < 2) return NextResponse.json({ error: "Başlık + en az bir veri satırı gerekli" }, { status: 422 });

    // başlık satırını eşle
    const headers = rows[0].map((h) => HEADER_MAP[h.toLocaleLowerCase("tr-TR").trim()] ?? h.toLocaleLowerCase("tr-TR").trim());
    const idx = (f: string) => headers.indexOf(f);
    const pick = (r: string[], f: string) => { const i = idx(f); return i >= 0 ? (r[i] ?? "") : ""; };

    const report = {
      totalRows: rows.length - 1,
      sessionsCreated: 0, sessionsUpdated: 0, roomsCreated: 0,
      personsMatched: 0, personsCreated: 0, personsUnmatched: 0,
      participationsCreated: 0, assignmentsCreated: 0,
      matchDetails: [] as { row: number; name?: string; email?: string; result: string; personId?: string }[],
      errors: [] as { row: number; message: string }[],
      dryRun: !!body.dryRun,
    };

    if (kind === "PARTICIPANTS") {
      // katılımcı listesi: name | email | company | title
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const fullName = pick(row, "name");
        const email = pick(row, "email");
        if (!fullName && !email) { report.errors.push({ row: r + 1, message: "Ad ve e-posta boş" }); continue; }
        const parts = fullName.split(/\s+/).filter(Boolean);
        const firstName = parts[0] ?? fullName;
        const lastName = parts.slice(1).join(" ") || "—";
        let person = email ? await db.person.findFirst({ where: { email } }) : null;
        let result = "";
        if (person) { result = "E-posta ile eşleşti"; report.personsMatched++; }
        else {
          person = await db.person.findFirst({
            where: { firstName: firstName, lastName: lastName, status: { not: "MERGED" } },
          });
          if (person) { result = "Ad soyad ile eşleşti"; report.personsMatched++; }
          else if (body.createMissingPersons !== false) {
            result = "Yeni kişi oluşturuldu";
            report.personsCreated++;
            if (!body.dryRun) {
              person = await db.person.create({
                data: { tenantId: edition.tenantId, firstName, lastName, email: email || null, company: pick(row, "company") || null, title: pick(row, "title") || null },
              });
            } else person = undefined;
          } else { result = "Eşleşmedi (yeni kişi oluşturma kapalı)"; report.personsUnmatched++; }
        }
        report.matchDetails.push({ row: r + 1, name: fullName || undefined, email: email || undefined, result, personId: person?.id });
        // katılım oluştur
        if (person && !body.dryRun) {
          const existing = await db.eventParticipation.findUnique({
            where: { editionId_personId: { editionId, personId: person.id } },
          });
          if (!existing) {
            await db.eventParticipation.create({ data: { editionId, personId: person.id, source: "IMPORT" } });
            report.participationsCreated++;
          }
        }
      }
    } else {
      // oturum programı: title | start | end | room | speaker | email | role | type
      const rooms = await db.programRoom.findMany({ where: { editionId } });
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const title = pick(row, "title");
        if (!title) { report.errors.push({ row: r + 1, message: "Oturum başlığı boş" }); continue; }
        const roomName = pick(row, "room");
        let roomId: string | null = rooms.find((x) => x.name.toLocaleLowerCase("tr-TR") === roomName.toLocaleLowerCase("tr-TR"))?.id ?? null;
        if (!roomId && roomName && body.createMissingRooms !== false) {
          if (!body.dryRun) {
            const room = await db.programRoom.create({ data: { editionId, name: roomName } });
            rooms.push(room); roomId = room.id; report.roomsCreated++;
          } else report.roomsCreated++;
        }
        const start = normDate(pick(row, "start"));
        const endRaw = pick(row, "end");
        const end = normDate(endRaw, start ?? undefined);
        const type = (pick(row, "type") || "TALK").toUpperCase().replace(/\s+/g, "_");
        // kişi eşleştirme
        const speakerName = pick(row, "speaker");
        const speakerEmail = pick(row, "email");
        let matchedPerson: { id: string; firstName: string; lastName: string } | null = null;
        let matchResult = "Konuşmacı belirtilmedi";
        if (speakerEmail || speakerName) {
          matchedPerson = speakerEmail ? await db.person.findFirst({ where: { email: speakerEmail } }) : null;
          if (matchedPerson) matchResult = "E-posta ile eşleşti";
          if (!matchedPerson && speakerName) {
            const parts = speakerName.split(/\s+/).filter(Boolean);
            const fn = parts[0] ?? speakerName; const ln = parts.slice(1).join(" ") || "—";
            matchedPerson = await db.person.findFirst({
              where: { firstName: fn, lastName: ln, status: { not: "MERGED" } },
            });
            matchResult = matchedPerson ? "Ad soyad ile eşleşti" : (body.createMissingPersons ? "Yeni kişi oluşturulacak" : "Eşleşmedi");
            if (!matchedPerson && body.createMissingPersons && !body.dryRun) {
              matchedPerson = await db.person.create({
                data: { tenantId: edition.tenantId, firstName: fn, lastName: ln, email: speakerEmail || null, company: pick(row, "company") || null },
              });
              matchResult = "Yeni kişi oluşturuldu";
            }
          }
          if (matchedPerson) { report.personsMatched++; report.matchDetails.push({ row: r + 1, name: speakerName || undefined, email: speakerEmail || undefined, result: matchResult, personId: matchedPerson.id }); }
          else report.personsUnmatched++;
        }
        if (body.dryRun) { report.sessionsCreated++; continue; }
        // aynı başlık + yakın saat varsa güncelle, yoksa oluştur
        const existing = await db.programSession.findFirst({ where: { editionId, title } });
        const data = {
          title, roomId, type: ["KEYNOTE", "TALK", "PANEL", "WORKSHOP", "BREAK", "NETWORKING", "POSTER_SESSION"].includes(type) ? type : "TALK",
          startTime: start ?? new Date(), endTime: end ?? (start ? new Date(start.getTime() + 45 * 60000) : new Date(Date.now() + 45 * 60000)),
        };
        const session = existing
          ? await db.programSession.update({ where: { id: existing.id }, data })
          : await db.programSession.create({ data: { editionId, ...data, status: "DRAFT" } });
        if (existing) report.sessionsUpdated++; else report.sessionsCreated++;
        // program ataması
        if (matchedPerson) {
          const participation = await db.eventParticipation.findUnique({
            where: { editionId_personId: { editionId, personId: matchedPerson.id } },
          });
          const role = (pick(row, "role") || "SPEAKER").toUpperCase().replace(/\s+/g, "_");
          await db.programAssignment.create({
            data: {
              sessionId: session.id,
              personId: matchedPerson.id,
              participationId: participation?.id ?? null,
              role: ["SPEAKER", "MODERATOR", "SESSION_CHAIR", "PANELIST"].includes(role) ? role : "SPEAKER",
              status: "INVITED",
            },
          });
          report.assignmentsCreated++;
        }
      }
    }

    if (!body.dryRun) {
      await db.activityLog.create({
        data: {
          tenantId: edition.tenantId, editionId,
          type: kind === "PARTICIPANTS" ? ActivityType.PARTICIPATION_SAVED : ActivityType.SESSION_SAVED,
          message: kind === "PARTICIPANTS"
            ? `İçe aktarım (katılımcı listesi): ${report.totalRows} satır · ${report.personsMatched} eşleşti · ${report.personsCreated} yeni`
            : `İçe aktarım (program): ${report.sessionsCreated} oturum · ${report.assignmentsCreated} atama · ${report.personsMatched} kişi eşleşti`,
          entityType: "Import", actorName: "Program İçe Aktarım",
        },
      });
    }

    return NextResponse.json({ ok: true, kind, ...report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "İçe aktarım başarısız" }, { status: 500 });
  }
}
