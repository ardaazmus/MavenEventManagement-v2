// DÜZELTME P1.5 — middleware public-path boundary: segment-sınırlı eşleşme kanıtı.
// Bu dosya YALNIZ MAVEN_AUTH=on iken ANLAMLIDIR (bayrak kapalıyken middleware bypass).
// Koşum: MAVEN_AUTH=on bunx playwright test tests/middleware-boundary.spec.ts
// Beklenti: public kuralların SEGMENT sınırı dışındaki benzer-önek yollar 401 alır.
import { test, expect } from "@playwright/test";

test.describe("middleware public-path boundary (MAVEN_AUTH=on)", () => {
  test("pozitif — gerçek public yüzeyler 401 ALMAZ", async ({ request }) => {
    expect((await request.get("/api/health")).status()).toBe(200);
    // public-register: 400/404/409/415 dönebilir ama ASLA 401 değil
    const pr = await request.post("/api/public-register", { data: {} });
    expect(pr.status()).not.toBe(401);
    // portal: 410/400/404 — asla 401 değil
    const portal = await request.get("/api/portal/participant");
    expect(portal.status()).not.toBe(401);
    // auth yüzeyi: 400/405/4xx — asla 401 değil
    const auth = await request.post("/api/auth/login", { data: {} });
    expect(auth.status()).not.toBe(401);
    // seed: bayrak-on'da bile public (kendi kapısıyla korunur)
    expect((await request.get("/api/seed")).status()).not.toBe(401);
  });

  test("negatif — benzer-önek istismar yolları 401 (eski geniş startsWith açık sayıyordu)", async ({ request }) => {
    for (const path of ["/api/healthXYZ", "/api/scanXYZ", "/api/publicity", "/api/healthz-deep", "/api/portalXYZ"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} public sanıldı`).toBe(401);
    }
    // korumalı gerçek uç anonim için 401
    const people = await request.get("/api/people");
    expect(people.status()).toBe(401);
  });

  test("negatif — exact kural alt-yolları KAPSAMAZ (/api/seed/xyz 401)", async ({ request }) => {
    // exact "/api/seed" kuralı segment sınırlı: alt-yol public DEĞİL
    const res = await request.get("/api/seed/deep-path");
    // seed alt-yolu gerçek bir rota değil → Next 404 DÖNEBİLİR (middleware'den geçmeden
    // önce yönlendirici yakalar). 404 = rota yok; 401 = middleware koruması. İkisi de güvenli;
    // 200 + veri SIZMASI yasaktır.
    expect([401, 404]).toContain(res.status());
  });
});
