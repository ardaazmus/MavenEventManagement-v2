import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAnnouncementInput,
  isAnnouncementLive,
  AnnouncementValidationError,
} from "../src/lib/announcements/validate.ts";

// H-11: duyuru doğrulama + yayında-kuralı sözleşmesi.

test("H-11 - geçerli girdi taslağa dönüşür (varsayılanlar)", () => {
  const d = parseAnnouncementInput({ title: " Fuar ", body: "Katılın" });
  assert.strictEqual(d.title, "Fuar");
  assert.strictEqual(d.body, "Katılın");
  assert.strictEqual(d.isActive, true);
  assert.strictEqual(d.sortOrder, 0);
  assert.strictEqual(d.imageUrl, null);
  assert.strictEqual(d.startsAt, null);
});

test("H-11 - zorunlu alan + uzunluk + URL + tarih kuralları", () => {
  assert.throws(() => parseAnnouncementInput({ title: "", body: "x" }), AnnouncementValidationError);
  assert.throws(() => parseAnnouncementInput({ title: "t", body: "" }), AnnouncementValidationError);
  assert.throws(() => parseAnnouncementInput({ title: "x".repeat(121), body: "b" }), /en fazla 120/);
  assert.throws(() => parseAnnouncementInput({ title: "t", body: "b", linkUrl: "javascript:alert(1)" }), /URL/);
  assert.throws(
    () => parseAnnouncementInput({ title: "t", body: "b", startsAt: "2026-05-02", endsAt: "2026-05-01" }),
    /önce olamaz/,
  );
  assert.throws(() => parseAnnouncementInput({ title: "t", body: "b", sortOrder: 10000 }), /0-9999/);
  const ok = parseAnnouncementInput({ title: "t", body: "b", linkUrl: "/etkinlik/fuar", sortOrder: "3" });
  assert.strictEqual(ok.linkUrl, "/etkinlik/fuar");
  assert.strictEqual(ok.sortOrder, 3);
});

test("H-11 - yayında-kuralı: pasif + pencere dışı elenir", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  assert.strictEqual(isAnnouncementLive({ isActive: true, startsAt: null, endsAt: null }, now), true);
  assert.strictEqual(isAnnouncementLive({ isActive: false, startsAt: null, endsAt: null }, now), false);
  assert.strictEqual(
    isAnnouncementLive({ isActive: true, startsAt: "2026-09-29T00:00:00Z", endsAt: null }, now),
    false,
  );
  assert.strictEqual(
    isAnnouncementLive({ isActive: true, startsAt: null, endsAt: "2026-09-27T00:00:00Z" }, now),
    false,
  );
  assert.strictEqual(
    isAnnouncementLive({ isActive: true, startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-10-01T00:00:00Z" }, now),
    true,
  );
});
