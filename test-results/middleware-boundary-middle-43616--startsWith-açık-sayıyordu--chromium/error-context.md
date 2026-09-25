# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: middleware-boundary.spec.ts >> middleware public-path boundary (MAVEN_AUTH=on) >> negatif — benzer-önek istismar yolları 401 (eski geniş startsWith açık sayıyordu)
- Location: tests/middleware-boundary.spec.ts:23:7

# Error details

```
Error: /api/healthXYZ public sanıldı

expect(received).toBe(expected) // Object.is equality

Expected: 401
Received: 404
```

# Test source

```ts
  1  | // DÜZELTME P1.5 — middleware public-path boundary: segment-sınırlı eşleşme kanıtı.
  2  | // Bu dosya YALNIZ MAVEN_AUTH=on iken ANLAMLIDIR (bayrak kapalıyken middleware bypass).
  3  | // Koşum: MAVEN_AUTH=on bunx playwright test tests/middleware-boundary.spec.ts
  4  | // Beklenti: public kuralların SEGMENT sınırı dışındaki benzer-önek yollar 401 alır.
  5  | import { test, expect } from "@playwright/test";
  6  | 
  7  | test.describe("middleware public-path boundary (MAVEN_AUTH=on)", () => {
  8  |   test("pozitif — gerçek public yüzeyler 401 ALMAZ", async ({ request }) => {
  9  |     expect((await request.get("/api/health")).status()).toBe(200);
  10 |     // public-register: 400/404/409/415 dönebilir ama ASLA 401 değil
  11 |     const pr = await request.post("/api/public-register", { data: {} });
  12 |     expect(pr.status()).not.toBe(401);
  13 |     // portal: 410/400/404 — asla 401 değil
  14 |     const portal = await request.get("/api/portal/participant");
  15 |     expect(portal.status()).not.toBe(401);
  16 |     // auth yüzeyi: 400/405/4xx — asla 401 değil
  17 |     const auth = await request.post("/api/auth/login", { data: {} });
  18 |     expect(auth.status()).not.toBe(401);
  19 |     // seed: bayrak-on'da bile public (kendi kapısıyla korunur)
  20 |     expect((await request.get("/api/seed")).status()).not.toBe(401);
  21 |   });
  22 | 
  23 |   test("negatif — benzer-önek istismar yolları 401 (eski geniş startsWith açık sayıyordu)", async ({ request }) => {
  24 |     for (const path of ["/api/healthXYZ", "/api/scanXYZ", "/api/publicity", "/api/healthz-deep", "/api/portalXYZ"]) {
  25 |       const res = await request.get(path);
> 26 |       expect(res.status(), `${path} public sanıldı`).toBe(401);
     |                                                      ^ Error: /api/healthXYZ public sanıldı
  27 |     }
  28 |     // korumalı gerçek uç anonim için 401
  29 |     const people = await request.get("/api/people");
  30 |     expect(people.status()).toBe(401);
  31 |   });
  32 | 
  33 |   test("negatif — exact kural alt-yolları KAPSAMAZ (/api/seed/xyz 401)", async ({ request }) => {
  34 |     // exact "/api/seed" kuralı segment sınırlı: alt-yol public DEĞİL
  35 |     const res = await request.get("/api/seed/deep-path");
  36 |     // seed alt-yolu gerçek bir rota değil → Next 404 DÖNEBİLİR (middleware'den geçmeden
  37 |     // önce yönlendirici yakalar). 404 = rota yok; 401 = middleware koruması. İkisi de güvenli;
  38 |     // 200 + veri SIZMASI yasaktır.
  39 |     expect([401, 404]).toContain(res.status());
  40 |   });
  41 | });
  42 | 
```