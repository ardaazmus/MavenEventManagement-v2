# Feature Specification: Sponsor Anlaşma Kapsam İzolasyonu (F-04)

**Feature Branch**: `003-sponsor-agreement-scope-isolation`  
**Created**: 2026-10-09  
**Status**: Draft  
**Input**: Yol haritası Adım 3: F-04 (agreement-scoped sponsor token bazı verileri sponsor kurumunun tamamı olarak okuyor)

---

## 1. Problem ve Gerekçe

`PortalToken` modeli, `scope: "SPONSOR"` için nullable `agreementId` taşımaktadır:
- `agreementId === null`: Eski/kurum-geneli jeton (Organization-scoped). Sponsor kurumun edisyondaki tüm anlaşmalarını, haklarını ve siparişlerini görebilir.
- `agreementId !== null`: Belirli bir anlaşmaya bağlı jeton (Agreement-scoped). Yalnızca o anlaşmaya ait verileri görmelidir.

### Mevcut Boşluk (F-04):
`src/app/api/portal/sponsor/route.ts` içinde:
- `agreements` sorgusu `...agreementFilter(token)` ile daraltılmakta ve yalnızca o anlaşma dönmektedir.
- Ancak `Entitlement` (hak havuzu) ve `Order` (siparişler) sorguları yalnızca `editionId` ve `organizationId` ile filtrelenmektedir.
- Sonuç olarak: Aynı sponsor kurumun (örneğin "Acme A.Ş.") iki farklı anlaşması (Anlaşma 1: ₺100.000 Ana Sponsorluk, Anlaşma 2: ₺10.000 Stant Katılımı) olduğunda, Anlaşma 2 için üretilmiş bir dış portal jetonuna sahip temsilci, Anlaşma 1'in siparişlerini, finansal tutarlarını ve özel haklarını da görebilmektedir.

Bu durum başka bir tenant'a sızıntı olmasa da, aynı kurumun farklı anlaşma sorumluları ve üçüncü taraf temsilcileri arasında yetkisiz veri görünürlüğü riski yaratmaktadır (OWASP BOLA / Scope Consistency).

---

## 2. Kullanıcı Senaryoları ve Kabul Kriterleri

### User Story 1 — Anlaşma Kapsamlı Jetonla Hak (Entitlement) İzolasyonu (Priority: P1)
Sponsor portalına anlaşma-kapsamlı jetonla (`token.agreementId = "agr_1"`) erişildiğinde, başka bir anlaşmaya (`agr_2`) etiketlenmiş veya bağlanmış haklar yanıtta listelenmez.

**Acceptance Criteria**:
1. `restrictions` veya metadata'sında `agreement:agr_2` bulunan bir hak, `token.agreementId = "agr_1"` olan portal yanıtında dönmez.
2. `token.agreementId = "agr_1"` ile eşleşen veya kurum geneli açık olan haklar döner.
3. Kurum-geneli jetonla (`token.agreementId = null`) girildiğinde kurumun tüm hakları dönmeye devam eder (geriye uyum).

---

### User Story 2 — Anlaşma Kapsamlı Jetonla Sipariş (Order) İzolasyonu (Priority: P1)
Sponsor portalına anlaşma-kapsamlı jetonla (`token.agreementId = "agr_1"`) erişildiğinde, başka bir anlaşmaya (`agr_2`) ait siparişler ve ödeme tutarları yanıtta listelenmez.

**Acceptance Criteria**:
1. `notes` veya başlığında `agreement:agr_2` bulunan bir sipariş, `token.agreementId = "agr_1"` olan portal yanıtında dönmez.
2. Kurum-geneli jetonla (`token.agreementId = null`) girildiğinde kurumun tüm siparişleri dönmeye devam eder.

---

### User Story 3 — Yanıt Metadata ve Scope Ayrımı (Priority: P2)
Portal yanıtında dönen `grant` nesnesi, jetonun kapsam türünü (`scope: "AGREEMENT" | "ORGANIZATION"`) ve `isAgreementScoped: boolean` bayrağını açıkça belirtir.

**Acceptance Criteria**:
1. Anlaşma-kapsamlı jetonda `grant.scope === "AGREEMENT"` ve `grant.agreementId !== null` döner.
2. Kurum-geneli jetonda `grant.scope === "ORGANIZATION"` ve `grant.agreementId === null` döner.

---

## 3. Test ve Doğrulama

1. `tests-mini/portal-sponsor-scope.test.mjs`:
   - Anlaşma A/B izolasyon testi (A jetonu B'nin hak ve siparişlerini görmez).
   - Kurum geneli jetonun geriye dönük uyumla her iki anlaşmayı da görmesi.
