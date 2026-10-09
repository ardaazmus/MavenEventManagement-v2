import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const scopeLib = path.resolve("src/lib/portal/sponsor-scope.ts");
const profileLib = path.resolve("src/lib/portal/sponsor-profile.ts");
const staffLib = path.resolve("src/lib/portal/sponsor-staff.ts");
const leadLib = path.resolve("src/lib/leads/capture.ts");
const meetingLib = path.resolve("src/lib/meetings/requests.ts");

test("P20.1 - sponsor kapsam: anlasma-kapsamli jeton yalniz kendi anlasmasina isler", async () => {
  const { checkSponsorScope, agreementFilter } = await import(pathToFileURL(scopeLib).href);
  const scoped = { scope: "SPONSOR", editionId: "e1", organizationId: "o1", agreementId: "a1" };

  assert.strictEqual(checkSponsorScope(scoped, { editionId: "e1", organizationId: "o1", agreementId: "a1" }).ok, true);
  assert.strictEqual(checkSponsorScope(scoped, { editionId: "e1", organizationId: "o1", agreementId: "a2" }).ok, false);
  // hedefsiz sorgu (liste) kapsam-disina dusmez — filtre daraltir
  assert.strictEqual(checkSponsorScope(scoped, { editionId: "e1", organizationId: "o1" }).ok, true);
  assert.deepStrictEqual(agreementFilter(scoped), { id: "a1" });

  // kurum geneli (eski) jeton: tum anlasmalar
  const wide = { scope: "SPONSOR", editionId: "e1", organizationId: "o1", agreementId: null };
  assert.strictEqual(checkSponsorScope(wide, { editionId: "e1", organizationId: "o1", agreementId: "a9" }).ok, true);
  assert.deepStrictEqual(agreementFilter(wide), {});

  // yabanci kurum / katilimci kapsami red
  assert.strictEqual(checkSponsorScope(wide, { editionId: "e1", organizationId: "o2" }).ok, false);
  assert.strictEqual(checkSponsorScope(wide, { editionId: "e2", organizationId: "o1" }).ok, false);
  assert.strictEqual(
    checkSponsorScope({ ...wide, scope: "PARTICIPANT" }, { editionId: "e1", organizationId: "o1" }).ok,
    false,
  );
});

test("P20.1 - profil yamasi: izinli alan + URL/e-posta bicimi", async () => {
  const { sanitizeProfilePatch } = await import(pathToFileURL(profileLib).href);

  const ok = sanitizeProfilePatch({ website: "https://acme.example", city: "Istanbul", name: "HACK", taxNo: "1" });
  assert.strictEqual(ok.ok, true);
  if (ok.ok) {
    assert.deepStrictEqual(Object.keys(ok.data).sort(), ["city", "website"]);
  }

  assert.strictEqual(sanitizeProfilePatch({ website: "javascript:alert(1)" }).ok, false);
  assert.strictEqual(sanitizeProfilePatch({ logoUrl: "ftp://x/y.png" }).ok, false);
  assert.strictEqual(sanitizeProfilePatch({ generalEmail: "degil-eposta" }).ok, false);
  assert.strictEqual(sanitizeProfilePatch({ city: "x".repeat(121) }).ok, false);
  assert.strictEqual(sanitizeProfilePatch({ name: "yalnizca yasakli" }).ok, false);
  assert.strictEqual(sanitizeProfilePatch(null).ok, false);
  const nulled = sanitizeProfilePatch({ city: "   " });
  assert.strictEqual(nulled.ok, true);
  if (nulled.ok) assert.strictEqual(nulled.data.city, null);
});

test("P20.1 - personel ekleme: kisi cozumleme + cift rol kilidi", async () => {
  const { planStaffAdd, decideStaffLink } = await import(pathToFileURL(staffLib).href);

  // personId ile mevcut aktif kisi
  const use = planStaffAdd({ personId: "p1" }, {
    byId: { id: "p1", status: "ACTIVE", firstName: "A", lastName: "B", company: "Acme" },
    byEmail: null,
  });
  assert.strictEqual(use.ok, true);
  if (use.ok) {
    assert.strictEqual(use.personId, "p1");
    assert.strictEqual(use.createPerson, null);
    assert.strictEqual(use.setCompany, false);
  }

  // birlesmis/pasif kisi red
  assert.strictEqual(planStaffAdd({ personId: "p1" }, {
    byId: { id: "p1", status: "MERGED", firstName: "A", lastName: "B", company: null }, byEmail: null,
  }).ok, false);
  assert.strictEqual(planStaffAdd({ personId: "yok" }, { byId: null, byEmail: null }).ok, false);

  // ad+soyad ile yeni kisi (e-posta cakismasi varsa mevcut kullanilir)
  const fresh = planStaffAdd({ firstName: "Yeni", lastName: "Kisi", email: "YENI@ex.com" }, { byId: null, byEmail: null });
  assert.strictEqual(fresh.ok, true);
  if (fresh.ok) {
    assert.strictEqual(fresh.personId, null);
    assert.deepStrictEqual(fresh.createPerson, { firstName: "Yeni", lastName: "Kisi", email: "yeni@ex.com" });
  }
  const clash = planStaffAdd({ firstName: "X", lastName: "Y", email: "v@ex.com" }, {
    byId: null, byEmail: { id: "p2", status: "ACTIVE", firstName: "V", lastName: "W", company: null },
  });
  assert.strictEqual(clash.ok, true);
  if (clash.ok) assert.strictEqual(clash.personId, "p2");

  assert.strictEqual(planStaffAdd({ firstName: "Tek" }, { byId: null, byEmail: null }).ok, false);
  assert.strictEqual(planStaffAdd({ firstName: "A", lastName: "B", email: "bozuk" }, { byId: null, byEmail: null }).ok, false);

  // baglanti karari: mevcut rol 409, baska edisyon 400
  assert.strictEqual(decideStaffLink({ participation: null, staffRole: null }, "e1").ok, true);
  const reuse = decideStaffLink({ participation: { id: "par1", editionId: "e1", source: "ADMIN_ENTRY" }, staffRole: null }, "e1");
  assert.strictEqual(reuse.ok, true);
  if (reuse.ok) assert.strictEqual(reuse.reuseParticipationId, "par1");
  const dup = decideStaffLink({ participation: { id: "par1", editionId: "e1", source: "SPONSOR_PORTAL" }, staffRole: { id: "r1", status: "INVITED" } }, "e1");
  assert.strictEqual(dup.ok, false);
  if (!dup.ok) assert.strictEqual(dup.status, 409);
  assert.strictEqual(decideStaffLink({ participation: { id: "par1", editionId: "eX", source: "SPONSOR_PORTAL" }, staffRole: null }, "e1").ok, false);
});

test("P20.1 - personel cikarma: sahiplik + onayli kayit kilidi", async () => {
  const { decideStaffRemove } = await import(pathToFileURL(staffLib).href);
  const base = { id: "par1", editionId: "e1", source: "SPONSOR_PORTAL", personCompany: "Acme", staffRoleId: "r1", confirmedRegistrations: 0 };

  assert.strictEqual(decideStaffRemove(base, { editionId: "e1", orgName: "Acme" }).ok, true);
  assert.strictEqual(decideStaffRemove({ ...base, source: "EXHIBITOR_PORTAL" }, { editionId: "e1", orgName: "Acme" }).ok, true);
  assert.strictEqual(decideStaffRemove(null, { editionId: "e1", orgName: "Acme" }).ok, false);

  // sahiplik ihlalleri 404 (varlik ifsa edilmez)
  for (const p of [
    { ...base, editionId: "eX" },
    { ...base, source: "ADMIN_ENTRY" },
    { ...base, personCompany: "Rakip" },
    { ...base, staffRoleId: null },
  ]) {
    const r = decideStaffRemove(p, { editionId: "e1", orgName: "Acme" });
    assert.strictEqual(r.ok, false);
    if (!r.ok) assert.strictEqual(r.status, 404);
  }

  // onayli kayit 409
  const locked = decideStaffRemove({ ...base, confirmedRegistrations: 1 }, { editionId: "e1", orgName: "Acme" });
  assert.strictEqual(locked.ok, false);
  if (!locked.ok) assert.strictEqual(locked.status, 409);
});

test("P20.2 - lead girdisi + iletisim maskesi", async () => {
  const { validateLeadInput, maskLeadContact } = await import(pathToFileURL(leadLib).href);

  const ok = validateLeadInput({ channel: "MANUAL", note: " kartvizit ", rating: "HOT" });
  assert.deepStrictEqual(ok, { ok: true, channel: "MANUAL", note: "kartvizit", rating: "HOT", purpose: "SPONSOR_FOLLOWUP", clientKey: null });
  assert.deepStrictEqual(validateLeadInput({}), { ok: true, channel: "BADGE_SCAN", note: null, rating: null, purpose: "SPONSOR_FOLLOWUP", clientKey: null });
  assert.strictEqual(validateLeadInput({ channel: "SMS" }).ok, false);
  assert.strictEqual(validateLeadInput({ rating: "LUKEWARM" }).ok, false);
  assert.strictEqual(validateLeadInput({ note: "x".repeat(1001) }).ok, false);
  assert.strictEqual(validateLeadInput({ purpose: "REKLAM" }).ok, false);
  assert.strictEqual(validateLeadInput({ clientKey: "x".repeat(81) }).ok, false);
  const keyed = validateLeadInput({ clientKey: "  k1  ", purpose: "EVENT_NETWORKING" });
  assert.deepStrictEqual(keyed, { ok: true, channel: "BADGE_SCAN", note: null, rating: null, purpose: "EVENT_NETWORKING", clientKey: "k1" });

  const consented = { firstName: "A", lastName: "B", email: "a@ex.com", phone: "555", company: "C", title: "T", consentVersion: "v3" };
  assert.deepStrictEqual(maskLeadContact(consented), consented);
  const masked = maskLeadContact({ ...consented, consentVersion: null });
  assert.strictEqual(masked.email, "a••••@ex.com");
  assert.strictEqual(masked.phone, "••••••");
  assert.strictEqual(masked.firstName, "A");
  assert.strictEqual(masked.company, "C");
});

test("P20.3 - gorusme: slot + gecis + cakisma", async () => {
  const { validateSlot, decideMeetingTransition, slotsOverlap, validateTimezone, slotWithinWindows, validateWindow } = await import(pathToFileURL(meetingLib).href);

  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const good = validateSlot({ slotStart: iso(now + 3_600_000), slotEnd: iso(now + 5_400_000) }, now);
  assert.strictEqual(good.ok, true);
  assert.strictEqual(validateSlot({ slotStart: iso(now + 5_400_000), slotEnd: iso(now + 3_600_000) }, now).ok, false);
  assert.strictEqual(validateSlot({ slotStart: iso(now + 3_600_000), slotEnd: iso(now + 12 * 3_600_000) }, now).ok, false);
  assert.strictEqual(validateSlot({ slotStart: iso(now - 7_200_000), slotEnd: iso(now - 3_600_000) }, now).ok, false);
  assert.strictEqual(validateSlot({ slotStart: "degil", slotEnd: iso(now + 3_600_000) }, now).ok, false);

  assert.strictEqual(decideMeetingTransition("REQUESTED", "CONFIRMED").ok, true);
  assert.strictEqual(decideMeetingTransition("REQUESTED", "DECLINED").ok, true);
  assert.strictEqual(decideMeetingTransition("REQUESTED", "COMPLETED").ok, false);
  assert.strictEqual(decideMeetingTransition("CONFIRMED", "COMPLETED").ok, true);
  assert.strictEqual(decideMeetingTransition("CONFIRMED", "REQUESTED").ok, false);
  assert.strictEqual(decideMeetingTransition("DECLINED", "CONFIRMED").ok, false);
  assert.strictEqual(decideMeetingTransition("COMPLETED", "CANCELLED").ok, false);

  const d = (h) => new Date(now + h * 3_600_000);
  assert.strictEqual(slotsOverlap(d(10), d(11), d(10.5), d(12)), true);
  assert.strictEqual(slotsOverlap(d(10), d(11), d(11), d(12)), false); // bitisik uclar cakismaz
  assert.strictEqual(slotsOverlap(d(10), d(12), d(9), d(10)), false);
  assert.strictEqual(slotsOverlap(d(10), d(12), d(10), d(12)), true);

  // timezone + pencere
  assert.deepStrictEqual(validateTimezone(undefined), { ok: true, timezone: "Europe/Istanbul" });
  assert.deepStrictEqual(validateTimezone("America/New_York"), { ok: true, timezone: "America/New_York" });
  assert.strictEqual(validateTimezone("Mars/Olympus").ok, false);
  assert.strictEqual(validateTimezone(42).ok, false);
  assert.strictEqual(slotWithinWindows(d(10), d(11), []), true); // pencere yok = acik
  assert.strictEqual(slotWithinWindows(d(10), d(11), [{ slotStart: d(9), slotEnd: d(12) }]), true);
  assert.strictEqual(slotWithinWindows(d(10), d(11), [{ slotStart: d(10), slotEnd: d(11) }]), true); // sinir dahil
  assert.strictEqual(slotWithinWindows(d(8), d(10), [{ slotStart: d(9), slotEnd: d(12) }]), false);
  assert.strictEqual(validateWindow(iso(now + 3_600_000), iso(now + 12 * 3_600_000), now).ok, true); // 11s pencere serbest
  assert.strictEqual(validateWindow(iso(now + 3_600_000), iso(now + 30 * 3_600_000), now).ok, false); // 29s yasak
  assert.strictEqual(validateWindow(iso(now - 7_200_000), iso(now - 3_600_000), now).ok, false);
});

test("F-04 - sponsor anlasma izolasyonu: haklar ve siparisler yalniz hedef anlasmaya filtrelenir", async () => {
  const { isItemInAgreementScope, extractAgreementTag } = await import(pathToFileURL(scopeLib).href);

  // 1. extractAgreementTag doğrulaması
  assert.strictEqual(extractAgreementTag("agreement:agr_100"), "agr_100");
  assert.strictEqual(extractAgreementTag("agreementId:agr_200"), "agr_200");
  assert.strictEqual(extractAgreementTag("Özel notlar agreement:agr_300 vs."), "agr_300");
  assert.strictEqual(extractAgreementTag("Kısıtsız hak"), null);
  assert.strictEqual(extractAgreementTag(null), null);

  // 2. Anlaşma-kapsamlı jeton (target: agr_1)
  const targetAgreement = "agr_1";

  // Hak A: Anlaşma 1'e ait
  const entA = { restrictions: "agreement:agr_1;vip:true" };
  // Hak B: Anlaşma 2'ye ait (F-04 izolasyon testi: gizlenmeli)
  const entB = { restrictions: "agreement:agr_2;vip:true" };
  // Hak C: Kurum geneli (anlaşma kısıtı yok)
  const entC = { restrictions: "vip:true" };

  assert.strictEqual(isItemInAgreementScope(entA, targetAgreement), true, "Hedef anlaşmaya ait hak görünmeli");
  assert.strictEqual(isItemInAgreementScope(entB, targetAgreement), false, "Başka anlaşmaya ait hak İZOLE EDİLMELİ (görünmemeli)");
  assert.strictEqual(isItemInAgreementScope(entC, targetAgreement), true, "Genel hak görünmeli");

  // Sipariş A: Anlaşma 1'e ait
  const orderA = { notes: "Sponsorluk agreement:agr_1" };
  // Sipariş B: Anlaşma 2'ye ait (F-04 izolasyon testi: gizlenmeli)
  const orderB = { notes: "Sponsorluk agreement:agr_2" };
  // Sipariş C: Genel sipariş
  const orderC = { notes: null };

  assert.strictEqual(isItemInAgreementScope(orderA, targetAgreement), true, "Hedef anlaşma siparişi görünmeli");
  assert.strictEqual(isItemInAgreementScope(orderB, targetAgreement), false, "Başka anlaşma siparişi İZOLE EDİLMELİ");
  assert.strictEqual(isItemInAgreementScope(orderC, targetAgreement), true, "Genel sipariş görünmeli");

  // 3. Kurum-geneli jeton (tokenAgreementId = null) -> tüm haklar ve siparişler görünür (geriye uyum)
  assert.strictEqual(isItemInAgreementScope(entA, null), true);
  assert.strictEqual(isItemInAgreementScope(entB, null), true);
  assert.strictEqual(isItemInAgreementScope(orderA, null), true);
  assert.strictEqual(isItemInAgreementScope(orderB, null), true);
});

