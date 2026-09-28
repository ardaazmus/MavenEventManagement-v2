// Modul 26 — SPONSOR PORTALI: anlasma-kapsamli erisim, profil, personel,
// kanitli teslim, lead yakalama, gorusme, ROI + iptalde jeton dusurme.
// API: sponsor-grants (cikar/liste/iptal), portal/sponsor (GET/PATCH),
// portal/action (deliverable-submit/staff-add/staff-remove/lead-capture/
// meeting-decide/meeting-cancel), portal/leads (liste+xlsx), portal/meetings,
// portal/sponsor/roi. Temizlik: olusturulan tum kayitlar silinir.
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const SUFFIX = Date.now().toString(36).slice(-6);

let editionId = "";
let tenantId = "";
let orgId = "";
let orgName = "";
let agreement1 = "";
let agreement2 = "";
let wideToken = "";
let scopedToken = "";
let scopedToken2 = "";
let participantToken = "";
let requesterPersonId = "";
let deliverableId = "";
let staffParticipationId = "";
let staffPersonId = "";
let leadPersonId = "";
let credentialCode = "";
let meetingId = "";
const createdIds = {
  tokens: [] as string[],
  persons: [] as string[],
  participations: [] as string[],
  credentials: [] as string[],
  leads: [] as string[],
  meetings: [] as string[],
  deliverables: [] as string[],
  agreements: [] as string[],
  orgs: [] as string[],
};

function virtualClientHeaders() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  return { "x-forwarded-for": ip };
}

async function postJSONWarm(request: APIRequestContext, path: string, body: unknown, tries = 5): Promise<APIResponse> {
  let last: APIResponse | null = null;
  for (let i = 0; i < tries; i++) {
    last = await request.post(path, { data: body, headers: virtualClientHeaders() });
    if ((last.headers()["content-type"] ?? "").includes("application/json")) return last;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!last) throw new Error(`route yanit vermedi: ${path}`);
  return last;
}

async function getWarm(request: APIRequestContext, path: string, tries = 5): Promise<APIResponse> {
  let last: APIResponse | null = null;
  for (let i = 0; i < tries; i++) {
    last = await request.get(path, { headers: virtualClientHeaders() });
    const ct = last.headers()["content-type"] ?? "";
    if (ct.includes("application/json") || ct.includes("spreadsheetml") || last.status() !== 404) return last;
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!last) throw new Error(`route yanit vermedi: ${path}`);
  return last;
}

function rawToken(): string {
  return `pt_${randomUUID().replace(/-/g, "")}`;
}

async function insertToken(raw: string, data: { scope: string; personId?: string | null; organizationId?: string | null; agreementId?: string | null }) {
  const row = await db.portalToken.create({
    data: {
      tokenHash: createHash("sha256").update(raw, "utf8").digest("hex"),
      scope: data.scope,
      editionId,
      personId: data.personId ?? null,
      organizationId: data.organizationId ?? null,
      agreementId: data.agreementId ?? null,
      expiresAt: new Date(Date.now() + 86_400_000),
      issuedBy: "ADMIN",
    },
  });
  createdIds.tokens.push(row.id);
  return row;
}

test.describe.serial("M26 — sponsor portali uctan uca", () => {
  test.afterAll(async () => {
    await db.meetingRequest.deleteMany({ where: { id: { in: createdIds.meetings } } });
    await db.leadCapture.deleteMany({ where: { id: { in: createdIds.leads } } });
    await db.eventRoleAssignment.deleteMany({ where: { participationId: { in: createdIds.participations } } });
    await db.registration.deleteMany({ where: { participationId: { in: createdIds.participations } } });
    await db.credential.deleteMany({ where: { id: { in: createdIds.credentials } } });
    await db.eventParticipation.deleteMany({ where: { id: { in: createdIds.participations } } });
    await db.portalToken.deleteMany({ where: { id: { in: createdIds.tokens } } });
    await db.deliverable.deleteMany({ where: { id: { in: createdIds.deliverables } } });
    await db.sponsorAgreement.deleteMany({ where: { id: { in: createdIds.agreements } } });
    await db.person.deleteMany({ where: { id: { in: createdIds.persons } } });
    await db.organization.deleteMany({ where: { id: { in: createdIds.orgs } } });
    await db.$disconnect();
  });

  test("kurulum: kurum + anlasmalar + jetonlar + rozet", async () => {
    const edition = await db.eventEdition.findFirst({ select: { id: true, tenantId: true }, orderBy: { createdAt: "asc" } });
    expect(edition).toBeTruthy();
    editionId = edition!.id;
    tenantId = edition!.tenantId;
    orgName = `M26 Org ${SUFFIX}`;

    const org = await db.organization.create({ data: { tenantId, name: orgName } });
    orgId = org.id;
    createdIds.orgs.push(org.id);

    const a1 = await db.sponsorAgreement.create({
      data: { editionId, organizationId: orgId, status: "ACTIVE", amount: 250000, signedAt: new Date() },
    });
    const a2 = await db.sponsorAgreement.create({
      data: { editionId, organizationId: orgId, status: "ACTIVE", amount: 100000, signedAt: new Date() },
    });
    agreement1 = a1.id;
    agreement2 = a2.id;
    createdIds.agreements.push(a1.id, a2.id);

    const d = await db.deliverable.create({
      data: { agreementId: agreement1, name: "Logo", type: "LOGO", status: "WAITING_SPONSOR" },
    });
    deliverableId = d.id;
    createdIds.deliverables.push(d.id);

    wideToken = rawToken();
    scopedToken = rawToken();
    scopedToken2 = rawToken();
    await insertToken(wideToken, { scope: "SPONSOR", organizationId: orgId });
    await insertToken(scopedToken, { scope: "SPONSOR", organizationId: orgId, agreementId: agreement1 });
    await insertToken(scopedToken2, { scope: "SPONSOR", organizationId: orgId, agreementId: agreement2 });

    // taranacak kisi (rizali) + rozet
    const lead = await db.person.create({
      data: { tenantId, firstName: "M26", lastName: `Lead${SUFFIX}`, email: `m26-lead-${SUFFIX}@test.dev`, consentVersion: "v3" },
    });
    leadPersonId = lead.id;
    createdIds.persons.push(lead.id);
    const leadPar = await db.eventParticipation.create({ data: { editionId, personId: lead.id, source: "PUBLIC_FORM" } });
    createdIds.participations.push(leadPar.id);
    credentialCode = `M26-${SUFFIX.toUpperCase()}-001`;
    const cred = await db.credential.create({ data: { participationId: leadPar.id, code: credentialCode, type: "QR", status: "ACTIVE" } });
    createdIds.credentials.push(cred.id);

    // gorusme talepcisi + katilimci jetonu
    const req = await db.person.create({ data: { tenantId, firstName: "M26", lastName: `Req${SUFFIX}` } });
    requesterPersonId = req.id;
    createdIds.persons.push(req.id);
    const reqPar = await db.eventParticipation.create({ data: { editionId, personId: req.id, source: "PUBLIC_FORM" } });
    createdIds.participations.push(reqPar.id);
    participantToken = rawToken();
    await insertToken(participantToken, { scope: "PARTICIPANT", personId: req.id });
  });

  test("sponsor GET: kurum jetonu tum anlasmalari, kapsamli jeton tekini gorur", async ({ request }) => {
    const wide = await getWarm(request, `/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${wideToken}`);
    expect(wide.status()).toBe(200);
    const wideBody = await wide.json();
    expect(wideBody.agreements.map((a: { id: string }) => a.id).sort()).toEqual([agreement1, agreement2].sort());
    expect(wideBody.grant).toEqual({ agreementId: null });

    const scoped = await getWarm(request, `/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}`);
    expect(scoped.status()).toBe(200);
    const scopedBody = await scoped.json();
    expect(scopedBody.agreements.map((a: { id: string }) => a.id)).toEqual([agreement1]);
    expect(scopedBody.grant).toEqual({ agreementId: agreement1 });

    const noToken = await request.get(`/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}`, { headers: virtualClientHeaders() });
    expect(noToken.status()).toBe(410);
  });

  test("profil PATCH: izinli alan yamanir, kritik alan dokunulmaz", async ({ request }) => {
    const patched = await request.patch("/api/portal/sponsor", {
      data: { editionId, organizationId: orgId, token: wideToken, profile: { website: "https://m26.example", city: "Istanbul", name: "HACK", taxNo: "X" } },
      headers: virtualClientHeaders(),
    });
    expect(patched.status()).toBe(200);
    const body = await patched.json();
    expect(body.organization.website).toBe("https://m26.example");
    expect(body.organization.city).toBe("Istanbul");
    const org = await db.organization.findUnique({ where: { id: orgId } });
    expect(org!.name).toBe(orgName);
    expect(org!.taxNo).toBeNull();

    const bad = await request.patch("/api/portal/sponsor", {
      data: { editionId, organizationId: orgId, token: wideToken, profile: { website: "javascript:x" } },
      headers: virtualClientHeaders(),
    });
    expect(bad.status()).toBe(400);
  });

  test("teslim: kanitsiz 400, kanitli SUBMITTED + kapsam disi 404", async ({ request }) => {
    const bare = await postJSONWarm(request, "/api/portal/action", { action: "deliverable-submit", token: scopedToken, deliverableId });
    expect(bare.status()).toBe(400);

    const ok = await postJSONWarm(request, "/api/portal/action", {
      action: "deliverable-submit", token: scopedToken, deliverableId, notes: "logo v3 yuklendi",
    });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).deliverable.status).toBe("SUBMITTED");

    // kapsam disi jeton (a2) a1 teslimine erisemez
    const foreign = await request.post("/api/portal/action", {
      data: { action: "deliverable-submit", token: scopedToken2, deliverableId, notes: "x" },
      headers: virtualClientHeaders(),
    });
    expect(foreign.status()).toBe(404);
  });

  test("personel: ekle (INVITED) + cift 409 + cikar", async ({ request }) => {
    const add = await postJSONWarm(request, "/api/portal/action", {
      action: "staff-add", token: wideToken, firstName: "M26", lastName: `Staff${SUFFIX}`, email: `m26-staff-${SUFFIX}@test.dev`,
    });
    expect(add.status()).toBe(200);
    const added = await add.json();
    staffParticipationId = added.participationId;
    staffPersonId = added.personId;
    expect(added.roleStatus).toBe("INVITED");
    createdIds.participations.push(staffParticipationId);
    createdIds.persons.push(staffPersonId);

    const dup = await request.post("/api/portal/action", {
      data: { action: "staff-add", token: wideToken, personId: staffPersonId },
      headers: virtualClientHeaders(),
    });
    expect(dup.status()).toBe(409);

    // listede gorunur (rol durumuyla)
    const list = await getWarm(request, `/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${wideToken}`);
    const staff = (await list.json()).staff as Array<{ participationId: string; staffRoleStatus: string }>;
    expect(staff.find((s) => s.participationId === staffParticipationId)?.staffRoleStatus).toBe("INVITED");

    const remove = await request.post("/api/portal/action", {
      data: { action: "staff-remove", token: wideToken, participationId: staffParticipationId },
      headers: virtualClientHeaders(),
    });
    expect(remove.status()).toBe(200);
    const roleLeft = await db.eventRoleAssignment.findFirst({ where: { participationId: staffParticipationId, role: "EXHIBITOR_STAFF" } });
    expect(roleLeft).toBeNull();
  });

  test("lead: rozet tarama + tekrar gunceller + maske + xlsx", async ({ request }) => {
    const cap = await postJSONWarm(request, "/api/portal/action", {
      action: "lead-capture", token: scopedToken, credentialCode, rating: "WARM", note: "standa ugradi",
    });
    expect(cap.status()).toBe(200);
    const capped = await cap.json();
    expect(capped.updated).toBe(false);
    createdIds.leads.push(capped.leadId);

    const rescan = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: scopedToken, credentialCode, rating: "HOT" },
      headers: virtualClientHeaders(),
    });
    expect(rescan.status()).toBe(200);
    expect((await rescan.json()).updated).toBe(true);
    expect(await db.leadCapture.count({ where: { agreementId: agreement1 } })).toBe(1);

    // rizasiz kisi maskeli listelenir
    const noconsent = await db.person.create({ data: { tenantId, firstName: "M26", lastName: `No${SUFFIX}`, email: `m26-no-${SUFFIX}@test.dev` } });
    createdIds.persons.push(noconsent.id);
    const ncPar = await db.eventParticipation.create({ data: { editionId, personId: noconsent.id, source: "PUBLIC_FORM" } });
    createdIds.participations.push(ncPar.id);
    const manual = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: scopedToken, personId: noconsent.id, channel: "MANUAL" },
      headers: virtualClientHeaders(),
    });
    expect(manual.status()).toBe(200);
    createdIds.leads.push((await manual.json()).leadId);

    const list = await getWarm(request, `/api/portal/leads?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}`);
    expect(list.status()).toBe(200);
    const items = (await list.json()).items as Array<{ contactMasked: boolean; person: { email: string | null } }>;
    expect(items.length).toBe(2);
    const masked = items.find((i) => i.contactMasked)!;
    expect(masked).toBeTruthy();
    expect(masked.person.email).toContain("••••");

    // xlsx yalniz rizali satiri indirir + denetim yazar
    const xlsx = await request.get(`/api/portal/leads?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}&format=xlsx`, { headers: virtualClientHeaders() });
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const buf = Buffer.from(await xlsx.body());
    const wb = XLSX.read(buf, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Lead'ler"], { header: 1 });
    const dataRows = rows.slice(5).filter((r) => r.length > 0);
    expect(dataRows.length).toBe(1);
    const audit = await db.activityLog.findFirst({
      where: { editionId, type: "EXPORT_DOWNLOADED", message: { contains: "LEADS" } },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  test("gorusme: talep + onay + cakisma 409 + iptal", async ({ request }) => {
    const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { startDate: true, endDate: true } });
    let base = Date.now();
    if (ed?.startDate && ed?.endDate) {
      const lo = ed.startDate.getTime() - 86_400_000;
      const hi = ed.endDate.getTime() + 86_400_000;
      if (base + 4 * 3_600_000 > hi) base = hi - 5 * 3_600_000;
      if (base + 2 * 3_600_000 < lo) base = lo + 3_600_000;
    }
    const iso = (ms: number) => new Date(ms).toISOString();
    const slotA = { slotStart: iso(base + 2 * 3_600_000), slotEnd: iso(base + 3 * 3_600_000) };

    const req1 = await postJSONWarm(request, "/api/portal/meetings", {
      editionId, agreementId: agreement1, token: participantToken, title: "Demo", ...slotA, location: "Stand",
    });
    expect(req1.status()).toBe(201);
    meetingId = (await req1.json()).meeting.id;
    createdIds.meetings.push(meetingId);

    const decide = await request.post("/api/portal/action", {
      data: { action: "meeting-decide", token: scopedToken, meetingId, decision: "CONFIRMED" },
      headers: virtualClientHeaders(),
    });
    expect(decide.status()).toBe(200);

    // cakisan ikinci talep onaylanamaz
    const req2 = await request.post("/api/portal/meetings", {
      data: {
        editionId, agreementId: agreement1, token: participantToken, title: "Demo2",
        slotStart: iso(base + 2.5 * 3_600_000), slotEnd: iso(base + 3.5 * 3_600_000),
      },
      headers: virtualClientHeaders(),
    });
    expect(req2.status()).toBe(201);
    const meeting2 = (await req2.json()).meeting.id as string;
    createdIds.meetings.push(meeting2);
    const clash = await request.post("/api/portal/action", {
      data: { action: "meeting-decide", token: scopedToken, meetingId: meeting2, decision: "CONFIRMED" },
      headers: virtualClientHeaders(),
    });
    expect(clash.status()).toBe(409);

    // katilimci kendi talebini iptal eder
    const cancel = await request.post("/api/portal/action", {
      data: { action: "meeting-cancel", token: participantToken, meetingId: meeting2 },
      headers: virtualClientHeaders(),
    });
    expect(cancel.status()).toBe(200);

    // sponsor listesi + katilimci listesi
    const sponsorList = await getWarm(request, `/api/portal/meetings?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}`);
    expect(sponsorList.status()).toBe(200);
    expect(((await sponsorList.json()).items as unknown[]).length).toBe(2);
    const partList = await getWarm(request, `/api/portal/meetings?editionId=${editionId}&token=${participantToken}`);
    expect(((await partList.json()).items as unknown[]).length).toBe(2);
  });

  test("lead kapanis: clientKey tekrari + amac + suresi-dolan liste disi", async ({ request }) => {
    // cevrimdisi tekrari: ayni anahtar ayni lead'e yakin sar (satir cogalmaz)
    const key = `m26-offline-${SUFFIX}`;
    const first = await postJSONWarm(request, "/api/portal/action", {
      action: "lead-capture", token: scopedToken, credentialCode, clientKey: key, purpose: "EVENT_NETWORKING",
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).updated).toBe(true); // mevcut lead guncellendi
    expect(await db.leadCapture.count({ where: { agreementId: agreement1 } })).toBe(2);
    const row = await db.leadCapture.findFirst({ where: { agreementId: agreement1, clientKey: key } });
    expect(row).toBeTruthy();
    expect(row!.consentPurpose).toBe("EVENT_NETWORKING");
    expect(row!.consentAtCapture).toBe("v3"); // yakalama anindaki riza goruntusu
    expect(row!.expiresAt).toBeTruthy();

    const badPurpose = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: scopedToken, credentialCode, purpose: "REKLAM" },
      headers: virtualClientHeaders(),
    });
    expect(badPurpose.status()).toBe(400);

    // suresi dolan lead liste/export/ROI disi
    const exp = await db.person.create({ data: { tenantId, firstName: "M26", lastName: `Exp${SUFFIX}`, consentVersion: "v3" } });
    createdIds.persons.push(exp.id);
    const expPar = await db.eventParticipation.create({ data: { editionId, personId: exp.id, source: "PUBLIC_FORM" } });
    createdIds.participations.push(expPar.id);
    const expCap = await request.post("/api/portal/action", {
      data: { action: "lead-capture", token: scopedToken, personId: exp.id, channel: "MANUAL" },
      headers: virtualClientHeaders(),
    });
    expect(expCap.status()).toBe(200);
    const expLeadId = (await expCap.json()).leadId as string;
    createdIds.leads.push(expLeadId);
    await db.leadCapture.update({ where: { id: expLeadId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const list = await getWarm(request, `/api/portal/leads?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}`);
    const items = (await list.json()).items as Array<{ id: string; purpose: string }>;
    expect(items.length).toBe(2);
    expect(items.find((i) => i.id === expLeadId)).toBeUndefined();
    expect(items.every((i) => typeof i.purpose === "string")).toBe(true);
  });

  test("uygunluk: pencere disi 409, pencere ici 201 + timezone", async ({ request }) => {
    const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { startDate: true, endDate: true } });
    let base = Date.now();
    if (ed?.startDate && ed?.endDate) {
      const lo = ed.startDate.getTime() - 86_400_000;
      const hi = ed.endDate.getTime() + 86_400_000;
      if (base + 4 * 3_600_000 > hi) base = hi - 5 * 3_600_000;
      if (base + 2 * 3_600_000 < lo) base = lo + 3_600_000;
    }
    const iso = (ms: number) => new Date(ms).toISOString();

    const win = await postJSONWarm(request, "/api/portal/availability", {
      editionId, organizationId: orgId, token: scopedToken, agreementId: agreement1,
      slotStart: iso(base + 2 * 3_600_000), slotEnd: iso(base + 6 * 3_600_000), timezone: "Europe/Istanbul", label: "Fuar 1. gun",
    });
    expect(win.status()).toBe(201);
    const windowId = (await win.json()).window.id as string;

    // katilimci pencereyi okur
    const read = await getWarm(request, `/api/portal/availability?editionId=${editionId}&agreementId=${agreement1}&token=${participantToken}`);
    expect(read.status()).toBe(200);
    expect(((await read.json()).items as unknown[]).length).toBe(1);

    // pencere disi talep 409
    const outside = await request.post("/api/portal/meetings", {
      data: {
        editionId, agreementId: agreement1, token: participantToken, title: "Dis",
        slotStart: iso(base + 1 * 3_600_000), slotEnd: iso(base + 1.5 * 3_600_000),
      },
      headers: virtualClientHeaders(),
    });
    expect(outside.status()).toBe(409);

    // pencere ici + farkli timezone etiketi 201
    const inside = await request.post("/api/portal/meetings", {
      data: {
        editionId, agreementId: agreement1, token: participantToken, title: "Ic",
        slotStart: iso(base + 3 * 3_600_000), slotEnd: iso(base + 4 * 3_600_000), timezone: "America/New_York",
      },
      headers: virtualClientHeaders(),
    });
    expect(inside.status()).toBe(201);
    const insideBody = await inside.json();
    expect(insideBody.meeting.timezone).toBe("America/New_York");
    createdIds.meetings.push(insideBody.meeting.id as string);

    const badTz = await request.post("/api/portal/meetings", {
      data: {
        editionId, agreementId: agreement1, token: participantToken,
        slotStart: iso(base + 3 * 3_600_000), slotEnd: iso(base + 4 * 3_600_000), timezone: "Mars/Olympus",
      },
      headers: virtualClientHeaders(),
    });
    expect(badTz.status()).toBe(400);

    // kapsam disi jeton baska anlasmanin penceresini okuyamaz
    const foreign = await request.get(`/api/portal/availability?editionId=${editionId}&agreementId=${agreement2}&token=${scopedToken}`, { headers: virtualClientHeaders() });
    expect(foreign.status()).toBe(404);

    const del = await request.delete(`/api/portal/availability?editionId=${editionId}&organizationId=${orgId}&id=${windowId}`, {
      headers: { ...virtualClientHeaders(), "x-portal-token": scopedToken },
    });
    expect(del.status()).toBe(200);
  });

  test("etkilesim: profil goruntuleme + favori + ROI baglantisi", async ({ request }) => {
    const rawSession = `ps_${randomUUID().replace(/-/g, "")}`;
    const session = await db.portalSession.create({
      data: {
        tokenHash: createHash("sha256").update(rawSession, "utf8").digest("hex"),
        editionId, kind: "AUTH", personId: requesterPersonId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const headers = { ...virtualClientHeaders(), "x-portal-session": rawSession };
    const v1 = await request.post("/api/portal/interact", { data: { action: "SPONSOR_VIEW", organizationId: orgId }, headers });
    expect(v1.status()).toBe(200);
    const v2 = await request.post("/api/portal/interact", { data: { action: "SPONSOR_VIEW", organizationId: orgId }, headers });
    expect((await v2.json()).deduped).toBe(true);

    const fav = await request.post("/api/portal/interact", { data: { action: "SPONSOR_FAVORITE", organizationId: orgId }, headers });
    expect((await fav.json()).favorite).toBe(true);

    const guestRaw = `ps_${randomUUID().replace(/-/g, "")}`;
    const guest = await db.portalSession.create({
      data: {
        tokenHash: createHash("sha256").update(guestRaw, "utf8").digest("hex"),
        editionId, kind: "GUEST", expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const guestFav = await request.post("/api/portal/interact", {
      data: { action: "SPONSOR_FAVORITE", organizationId: orgId },
      headers: { ...virtualClientHeaders(), "x-portal-session": guestRaw },
    });
    expect(guestFav.status()).toBe(403);

    // ROI tek-anlasma kapsaminda etkilesimi tasir + tazelik damgasi
    const roi = await getWarm(request, `/api/portal/sponsor/roi?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken}`);
    const roiBody = await roi.json();
    expect(roiBody.agreements.length).toBe(1);
    expect(roiBody.agreements[0].engagement).toEqual({ profileViews: 1, favorites: 1 });
    expect(roiBody.totals.profileViews).toBe(1);
    expect(roiBody.totals.favorites).toBe(1);
    expect(roiBody.agreements[0].leads.qualified).toBe(1);
    expect(roiBody.agreements[0].leads.scans).toBe(1);
    expect(typeof roiBody.computedAt).toBe("string");

    await db.sponsorFavorite.deleteMany({ where: { editionId, organizationId: orgId } });
    await db.portalAnalyticsLog.deleteMany({ where: { editionId, kind: "SPONSOR_VIEW", meta: orgId } });
    await db.portalSession.deleteMany({ where: { id: { in: [session.id, guest.id] } } });
  });

  test("kiyas: kendi deger + akran grubu + K kapisi", async ({ request }) => {
    const bench = await getWarm(request, `/api/analytics/benchmark?editionId=${editionId}&organizationId=${orgId}&metric=leads&token=${wideToken}`);
    expect(bench.status()).toBe(200);
    const body = await bench.json();
    expect(body.own.organizationId).toBe(orgId);
    expect(body.own.value).toBe(2); // canli lead'ler
    expect(typeof body.peer).toBe("object");

    // yuksek K her grubu kapatir
    const strict = await request.get(`/api/analytics/benchmark?editionId=${editionId}&organizationId=${orgId}&metric=leads&k=99&token=${wideToken}`, { headers: virtualClientHeaders() });
    expect((await strict.json()).peer.suppressed).toBe(true);

    // personel yolu: tum gruplar, kurum kimligi yok
    const staff = await request.get(`/api/analytics/benchmark?editionId=${editionId}&metric=leads`, { headers: virtualClientHeaders() });
    expect(staff.status()).toBe(200);
    const staffBody = await staff.json();
    expect(Array.isArray(staffBody.groups)).toBe(true);
    expect(JSON.stringify(staffBody.groups)).not.toContain(orgId);

    const badMetric = await request.get(`/api/analytics/benchmark?editionId=${editionId}&metric=yok`, { headers: virtualClientHeaders() });
    expect(badMetric.status()).toBe(400);
  });

  test("ROI + grant yasam dongusu + iptalde jeton dusurme", async ({ request }) => {
    const roi = await getWarm(request, `/api/portal/sponsor/roi?editionId=${editionId}&organizationId=${orgId}&token=${wideToken}`);
    expect(roi.status()).toBe(200);
    const roiBody = await roi.json();
    expect(roiBody.totals.leads).toBe(2);
    expect(roiBody.totals.meetingsConfirmed).toBe(1);
    expect(roiBody.totals.agreementAmount).toBe(350000);

    // grant cikarimi: ham jeton bir kez doner
    const grant = await postJSONWarm(request, "/api/portal/sponsor-grants", {
      editionId, organizationId: orgId, agreementId: agreement1, ttlDays: 7,
    });
    expect(grant.status()).toBe(201);
    const granted = await grant.json();
    expect(typeof granted.token).toBe("string");
    expect(granted.token.startsWith("pt_")).toBe(true);
    const grantRow = await db.portalToken.findFirst({ where: { editionId, organizationId: orgId, agreementId: agreement1 }, orderBy: { issuedAt: "desc" } });
    createdIds.tokens.push(grantRow!.id);

    const list = await getWarm(request, `/api/portal/sponsor-grants?editionId=${editionId}&organizationId=${orgId}`);
    expect(list.status()).toBe(200);
    const items = (await list.json()).items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.some((i) => "token" in i || "tokenHash" in i)).toBe(false);

    const revoke = await request.delete(`/api/portal/sponsor-grants?id=${grantRow!.id}`, { headers: virtualClientHeaders() });
    expect(revoke.status()).toBe(200);
    const revoked = await getWarm(request, `/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${granted.token}`);
    expect(revoked.status()).toBe(410);

    // anlasma iptali kapsamli jetonu dusurur, kurum jetonu yasar
    const cancel = await request.put(`/api/sponsor-agreements/${agreement2}`, {
      data: { status: "CANCELLED", transitionReason: "M26 testi" },
      headers: virtualClientHeaders(),
    });
    expect(cancel.status()).toBe(200);
    const dead = await request.get(`/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${scopedToken2}`, { headers: virtualClientHeaders() });
    expect(dead.status()).toBe(410);
    const alive = await request.get(`/api/portal/sponsor?editionId=${editionId}&organizationId=${orgId}&token=${wideToken}`, { headers: virtualClientHeaders() });
    expect(alive.status()).toBe(200);
  });
});
