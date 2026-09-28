import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const libPath = path.resolve("src/lib/theme/preferences.ts");

test("P15.1/P15.2 - tema çözünürlüğü: kullanıcı > kiracı > işletim sistemi", async () => {
  const { resolveTheme, sanitizeThemeChoice } = await import(pathToFileURL(libPath).href);
  assert.strictEqual(sanitizeThemeChoice("DARK"), "dark");
  assert.strictEqual(sanitizeThemeChoice("gece"), null);
  assert.strictEqual(sanitizeThemeChoice(null), null);

  assert.deepStrictEqual(resolveTheme({ user: "dark", tenantDefault: "light", os: "light" }), { resolved: "dark", source: "user" });
  assert.deepStrictEqual(resolveTheme({ user: null, tenantDefault: "dark", os: "light" }), { resolved: "dark", source: "tenant" });
  assert.deepStrictEqual(resolveTheme({ user: "system", tenantDefault: "dark", os: "light" }), { resolved: "light", source: "os" });
  assert.deepStrictEqual(resolveTheme({ user: null, tenantDefault: "system", os: "dark" }), { resolved: "dark", source: "os" });
  assert.deepStrictEqual(resolveTheme({}), { resolved: "light", source: "os" });
});

test("P15.3 - kontrast: WCAG oranları ve marka bekçisi", async () => {
  const { contrastRatio, checkBrandPrimary, validateTenantThemePatch, ThemeValidationError } = await import(pathToFileURL(libPath).href);
  assert.strictEqual(contrastRatio([255, 255, 255], [0, 0, 0]), 21);
  assert.strictEqual(contrastRatio([18, 18, 18], [18, 18, 18]), 1);

  const teal = checkBrandPrimary("#0d9488");
  assert.ok(teal && teal.ok, "#0d9488 eşikten geçmeli");
  assert.strictEqual(teal.bestForeground, "#000000", "petrol üstüne siyah metin daha okunaklı");

  const pale = checkBrandPrimary("#f5f5f5");
  assert.ok(pale && !pale.ok, "açık zemin beyaz metni taşımaz");
  assert.strictEqual(pale.bestForeground, "#000000");
  assert.strictEqual(checkBrandPrimary("petrol"), null, "hex olmayan renk reddedilir");

  // Eşiğin altında kalan marka rengi kaydedilemez.
  assert.throws(() => validateTenantThemePatch({ brandPrimary: "#f5f5f5" }), (e) => e instanceof ThemeValidationError);
  assert.throws(() => validateTenantThemePatch({ brandPrimary: "#b0b0b0" }), (e) => e instanceof ThemeValidationError);

  const valid = validateTenantThemePatch({ themeDefault: "dark", brandPrimary: "#0d9488" });
  assert.deepStrictEqual(valid, { themeDefault: "dark", brandPrimary: "#0d9488", brandForeground: "#000000" });
  const cleared = validateTenantThemePatch({ themeDefault: "bozuk", brandPrimary: "" });
  assert.deepStrictEqual(cleared, { themeDefault: "system", brandPrimary: null, brandForeground: null });
});

test("P15 - rota/uç kablosu: çerez tercihi + yönetici kapısı + sağlayıcı + portal ayrımı", async () => {
  const account = fs.readFileSync(path.resolve("src/app/api/account/theme/route.ts"), "utf8");
  assert.ok(account.includes("THEME_COOKIE"), "hesap ucu çerezi okumalı/yazmalı");
  assert.ok(account.includes("cookies.set"), "PATCH çerez yazmalı");
  assert.ok(account.includes("themeDefault"), "GET kiracı varsayılanını döndürmeli");

  const admin = fs.readFileSync(path.resolve("src/app/api/admin/theme/route.ts"), "utf8");
  assert.ok(admin.includes("requireAdmin"), "kiracı teması yönetici kapılı olmalı");
  assert.ok(admin.includes("validateTenantThemePatch"), "marka kontrastı doğrulanmalı");
  assert.ok(admin.includes("ThemeValidationError"), "422 taşınmalı");

  const layout = fs.readFileSync(path.resolve("src/app/layout.tsx"), "utf8");
  assert.ok(layout.includes("AppThemeProvider"), "kök yerleşim sağlayıcıyı sarmalı");
  assert.ok(layout.includes("cookies()"), "SSR tercihi çerezden okumalı");
  assert.ok(layout.includes('?? "light"'), "kayıtlı tercih yoksa açık tema varsayılmalı");

  const provider = fs.readFileSync(path.resolve("src/components/theme-provider.tsx"), "utf8");
  assert.ok(provider.includes("next-themes"), "next-themes kullanılmalı");
  assert.ok(provider.includes("forcedTheme") || provider.includes("PortalThemeGuard"), "portal ayrımı olmalı");
  assert.ok(provider.includes('classList.add("light")'), "portal açık temaya zorlanmalı");
  assert.ok(!provider.includes("useTheme"), "portal koruma kalıcılığa dokunmamalı");

  const page = fs.readFileSync(path.resolve("src/app/page.tsx"), "utf8");
  assert.ok(page.includes("PortalThemeGuard"), "portal dalı koruma altında olmalı");

  const shell = fs.readFileSync(path.resolve("src/components/maven/shell.tsx"), "utf8");
  assert.ok(shell.includes("ThemeSwitcher"), "üst şeritte tema seçici olmalı");
  assert.ok(shell.includes("setTheme"), "seçim next-themes'e yazılmalı");
  assert.ok(shell.includes("/api/account/theme"), "seçim SSR çerezine kalıcı yazılmalı");
  assert.ok(shell.includes("aria-pressed"), "seçili tema erişilebilir işaretlenmeli");
});
