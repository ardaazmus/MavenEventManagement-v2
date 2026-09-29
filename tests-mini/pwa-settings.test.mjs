import test from "node:test";
import assert from "node:assert/strict";
import {
  PWA_DEFAULTS,
  parsePwaSettings,
  validatePwaSettingsInput,
  serializePwaSettings,
  pwaInstallabilityChecklist,
  PWA_SHORTCUT_HASH,
} from "../src/lib/pwa-settings.ts";
import { buildPortalManifest } from "../src/lib/portal-manifest.ts";

// PWA-ADMIN v1 sözleşmesi: şema + varsayılanlar + manifest üretici.

// ── varsayılanlar ──

test("PWA-ADMIN-1 — boş/kayıtsız ayar sektör varsayılanlarına düşer", () => {
  for (const raw of [null, undefined, ""]) {
    const s = parsePwaSettings(raw);
    assert.equal(s.display, "standalone");
    assert.equal(s.orientation, "portrait");
    assert.equal(s.backgroundColor, "#ffffff");
    assert.equal(s.installBanner, true);
    assert.equal(s.installDelaySec, 45);
    assert.equal(s.installDismissDays, 7);
    assert.equal(s.iosInstructions, true);
    assert.equal(s.offlineBanner, true);
    assert.deepEqual(s.shortcuts, []);
    assert.deepEqual(s.screenshots, []);
  }
  assert.deepEqual(parsePwaSettings(null), PWA_DEFAULTS);
});

test("PWA-ADMIN-2 — bozuk JSON çökmez, varsayılana düşer", () => {
  assert.deepEqual(parsePwaSettings("{bozuk"), PWA_DEFAULTS);
  assert.deepEqual(parsePwaSettings("[1,2]"), PWA_DEFAULTS);
  assert.deepEqual(parsePwaSettings('"scalar"'), PWA_DEFAULTS);
});

test("PWA-ADMIN-3 — kısmi-bozuk kayıtta sağlam alanlar kurtarılır", () => {
  const s = parsePwaSettings(JSON.stringify({ shortName: "No-Dig", installDelaySec: "asla", shortcuts: "x" }));
  assert.equal(s.shortName, "No-Dig");
  assert.equal(s.installDelaySec, 45);
  assert.deepEqual(s.shortcuts, []);
});

// ── katı doğrulama (API 400) vs zarif bozulma ──

test("PWA-ADMIN-4 — yapısal hata 400 üretir (issue listesiyle)", () => {
  const bad = validatePwaSettingsInput({
    shortcuts: [1, 2, 3, 4, 5],
    display: "fullscreen-hologram",
    installDelaySec: 9999,
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.length >= 3);
  assert.ok(bad.issues.some((i) => i.startsWith("shortcuts")));
  assert.ok(bad.issues.some((i) => i.startsWith("display")));
  assert.ok(bad.issues.some((i) => i.startsWith("installDelaySec")));
});

test("PWA-ADMIN-5 — kısayol etiketi boş/uzun ya da hedef bilinmiyorsa 400", () => {
  assert.equal(validatePwaSettingsInput({ shortcuts: [{ label: "", target: "program" }] }).ok, false);
  assert.equal(validatePwaSettingsInput({ shortcuts: [{ label: "x".repeat(25), target: "program" }] }).ok, false);
  assert.equal(validatePwaSettingsInput({ shortcuts: [{ label: "P", target: "admin-panel" }] }).ok, false);
  assert.equal(validatePwaSettingsInput({ shortcuts: [{ label: "Program", target: "program" }] }).ok, true);
});

test("PWA-ADMIN-6 — kozmetik alanlar sessizce temizlenir (400 değil)", () => {
  const res = validatePwaSettingsInput({
    backgroundColor: "kırmızı",
    iconSrc: "javascript:alert(1)",
    iconMaskableSrc: "//evil.example/icon.png",
  });
  assert.equal(res.ok, true);
  assert.equal(res.value.backgroundColor, "#ffffff");
  assert.equal(res.value.iconSrc, "");
  assert.equal(res.value.iconMaskableSrc, "");
});

test("PWA-ADMIN-7 — güvenli URL'ler aynen geçer", () => {
  const res = validatePwaSettingsInput({
    iconSrc: "/marka/ikon-512.png",
    screenshots: [{ src: "https://cdn.example/e.png", wide: true }],
  });
  assert.equal(res.ok, true);
  assert.equal(res.value.iconSrc, "/marka/ikon-512.png");
  assert.equal(res.value.screenshots[0].wide, true);
});

// ── manifest üretici ──

test("PWA-ADMIN-8 — pwa yoksa ÇIKTI DEĞİŞMEZ (regresyon kilidi)", () => {
  const m = buildPortalManifest({ editionSlug: "no-dig-2026", name: "No-Dig 2026", themeColor: "#0d9488" });
  assert.equal(m.display, "standalone");
  assert.equal(m.orientation, "portrait-primary");
  assert.equal(m.short_name, "No-Dig");
  assert.equal(m.icons.length, 3);
  assert.equal(m.shortcuts, undefined);
  assert.equal(m.screenshots, undefined);
});

test("PWA-ADMIN-9 — özel ad/renk/dil manifeste yansır", () => {
  const m = buildPortalManifest({
    editionSlug: "s", name: "Test Etkinliği 2026",
    pwa: { ...PWA_DEFAULTS, appName: "Özel Uygulama", shortName: "Özel", description: "d", lang: "en", backgroundColor: "#000000" },
  });
  assert.equal(m.name, "Özel Uygulama");
  assert.equal(m.short_name, "Özel");
  assert.equal(m.description, "d");
  assert.equal(m.lang, "en");
  assert.equal(m.background_color, "#000000");
});

test("PWA-ADMIN-10 — kısayollar scope-içi derin bağdır (en fazla 4)", () => {
  const m = buildPortalManifest({
    editionSlug: "no-dig-2026", name: "N",
    pwa: {
      ...PWA_DEFAULTS,
      shortcuts: [
        { label: "Program", target: "program" },
        { label: "Harita", target: "map" },
      ],
    },
  });
  assert.equal(m.shortcuts.length, 2);
  assert.equal(m.shortcuts[0].url, "/?portal=no-dig-2026#p=program");
  assert.equal(m.shortcuts[1].url, "/?portal=no-dig-2026#p=map");
  for (const s of m.shortcuts) {
    assert.ok(s.url.startsWith("/?portal="));
    assert.ok(s.icons.length > 0);
  }
  // parite kilidi: şemadaki HER hedef manifestte geçerli portal ekranına çözülür
  for (const target of Object.keys(PWA_SHORTCUT_HASH)) {
    const mm = buildPortalManifest({
      editionSlug: "s", name: "N",
      pwa: { ...PWA_DEFAULTS, shortcuts: [{ label: "X", target }] },
    });
    assert.match(mm.shortcuts[0].url, /^\/\?portal=s#p=(home|program|speakers|sponsors|map|qa|forms|b2b|profile)$/);
  }
});

test("PWA-ADMIN-11 — ekran görüntüleri form_factor ile yayılır", () => {
  const m = buildPortalManifest({
    editionSlug: "s", name: "N",
    pwa: {
      ...PWA_DEFAULTS,
      screenshots: [
        { src: "/s/dar.png", wide: false },
        { src: "https://cdn.example/genis.jpg", wide: true },
      ],
    },
  });
  assert.equal(m.screenshots.length, 2);
  assert.equal(m.screenshots[0].form_factor, "narrow");
  assert.equal(m.screenshots[0].type, "image/png");
  assert.equal(m.screenshots[1].form_factor, "wide");
  assert.equal(m.screenshots[1].type, "image/jpeg");
});

test("PWA-ADMIN-12 — özel ikon maskable ile birlikte yayılır", () => {
  const m = buildPortalManifest({
    editionSlug: "s", name: "N",
    pwa: { ...PWA_DEFAULTS, iconSrc: "/marka/ikon.png" },
  });
  assert.ok(m.icons.every((i) => i.src === "/marka/ikon.png"));
  assert.ok(m.icons.some((i) => i.purpose === "maskable"));
});

// ── kurulabilirlik kontrol listesi ──

test("PWA-ADMIN-13 — varsayılan ayar 9/9 geçirir (SW erişilebilirken)", () => {
  const list = pwaInstallabilityChecklist({
    settings: PWA_DEFAULTS, editionName: "No-Dig Turkey 2026", themeColor: "#0d9488", swReachable: true,
  });
  assert.equal(list.length, 9);
  assert.ok(list.every((c) => c.pass), JSON.stringify(list.filter((c) => !c.pass)));
});

test("PWA-ADMIN-14 — display=browser ve erişilemeyen SW kırmızı verir", () => {
  const list = pwaInstallabilityChecklist({
    settings: { ...PWA_DEFAULTS, display: "browser" }, editionName: "N", themeColor: "#0d9488", swReachable: false,
  });
  assert.equal(list.find((c) => c.key === "display").pass, false);
  assert.equal(list.find((c) => c.key === "service-worker").pass, false);
});

// ── serileştirme turu ──

test("PWA-ADMIN-15 — serialize→parse turu kayıpsızdır", () => {
  const v = validatePwaSettingsInput({ shortName: "ND", installDelaySec: 10 });
  assert.equal(v.ok, true);
  const round = parsePwaSettings(serializePwaSettings(v.value));
  assert.equal(round.shortName, "ND");
  assert.equal(round.installDelaySec, 10);
  assert.equal(round.display, "standalone");
});
