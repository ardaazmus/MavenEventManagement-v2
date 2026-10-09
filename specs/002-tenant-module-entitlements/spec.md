# Feature Specification: Tenant ve Ürün Entitlement Sözleşmesi (F-05 & CONTEXT.md)

**Feature Branch**: `002-tenant-module-entitlements`  
**Created**: 2026-10-09  
**Status**: Draft / Needs Approval  
**Input**: Yol Haritası Adım 2: F-05 (A → B Ürün modül yetki sözleşmesi) & CONTEXT.md (§22-24, §38-47)

---

## 1. Problem ve Gerekçe

`CONTEXT.md` ve denetim raporu bulgusu **F-05**, platform mimarisinde 3 katmanlı yetki hiyerarşisi tanımlamaktadır:
1. **Platform Yetkisi (Firma A → Firma B):** Platform sahibi Firma A'nın, müşteri kiracı Firma B'ye tahsis ettiği üst modül/yetenek sınırıdır.
2. **Firma Modül Aktivasyonu (Firma B Çalışma Alanı):** Firma B'nin kendisine tahsis edilmiş modüller arasından şirket genelinde açtığı modüllerdir.
3. **İş/Edisyon Modül Aktivasyonu (Firma B Etkinlik Edisyonu):** Firma B'nin belirli bir etkinlik edisyonunda kullanmayı seçtiği aktif yeteneklerdir (`EventCapability`).

### Mevcut Mimari Boşluk (F-05):
- Mevcut sistemde `capability.toggle` (`src/app/api/flows/route.ts`), bir edisyon üzerinde herhangi bir `EventCapability`'nin (`SCIENTIFIC`, `SPONSORSHIP`, `ACCOMMODATION`, `FLOOR_PLAN`, `B2B_MEETINGS` vb.) açılmasına izin vermektedir; Firma A'nın Firma B'ye bu modülü verip vermediği kontrol **edilmemektedir**.
- Platform sahibi (Firma A) için kiracıların modül haklarını sorgulayabileceği, modül paketlerini verebileceği, geri çekebileceği ve denetleyebileceği bir sözleşme/uç nokta bulunmamaktadır.
- `CONTEXT.md` §47 ilkesi olan **"Varsayılan davranış sınırlı erişimdir (deny-by-default)"** kuralı, modül/yetenek seviyesinde sunucu tarafından enforce edilmemektedir.

---

## 2. Kullanıcı Senaryoları ve Kabul Kriterleri

### User Story 1 — Platform Sahibi (Firma A) Modül Entitlement Denetimi ve Yönetimi (Priority: P1)
Platform yöneticisi (`requireSuperAdmin` / `x-super-admin-key`), `/api/saas/entitlements` ucu üzerinden bir kiracının hangi modüllere sahip olduğunu sorgulayabilir (`GET`) ve kiracıya belirli modülleri tanımlayabilir veya askıya alabilir (`PUT`).

**Acceptance Criteria**:
1. `GET /api/saas/entitlements?tenantId=...`:
   - `x-super-admin-key` doğru olduğunda kiracının planı, varsayılan plan modülleri, özel tahsis/kısıtlama override'ları ve nihai etkin modül listesi döner.
   - Anahtar eksik veya yanlışsa `404 / 503` döner (timing-safe maskeleme).
2. `PUT /api/saas/entitlements`:
   - Gövde: `{ tenantId, module, enabled: boolean, notes?: string }`.
   - Modül yetkisi verildiğinde veya geri çekildiğinde `ActivityLog` tablosuna `TENANT_ENTITLEMENT_UPDATED` tipinde audit kaydı yazılır.
   - Geçersiz modül veya kiracı için `400 / 404` döner.

---

### User Story 2 — Edisyon Yetenek Açmada Deny-by-Default Platform Kontrolü (Priority: P1)
Firma B personeli bir edisyonda bir yeteneği açmak istediğinde (`capability.toggle` with `enabled: true`), sunucu kiracının o modül için platform yetkisine (`Platform Entitlement`) sahip olup olmadığını doğrular.

**Acceptance Criteria**:
1. Kiracının planında veya override listesinde yetkisi **olmayan** bir modül açılmak istendiğinde (örneğin BASIC planındaki bir kiracının `SCIENTIFIC` veya `FLOOR_PLAN` açmaya çalışması), akış `403 Forbidden` döner:
   - Hata gövdesi: `{ error: "Bu yetenek platform sahibi (Firma A) tarafından kiracınız için yetkilendirilmemiştir", code: "PLATFORM_MODULE_UNENTITLED" }`.
   - Veritabanında `EventCapability.enabled` `true` yapılmaz.
2. Kiracının platform yetkisine **sahip olduğu** modüller (örneğin PRO plandaki kiracının `SPONSORSHIP` veya `REGISTRATION` açması), mevcut yetki kontrolleri eşliğinde başarıyla `true` yapılır ve `ActivityLog` kaydı düşülür.
3. Yetenek kapatma (`enabled: false`) işlemi, mevcut çalışan işleri aksatmamak adına kısıtlanmaz; her zaman izin verilir.

---

### User Story 3 — Plan Bazlı Varsayılan Entitlement Matrisi (Priority: P2)
Sistemde her SaaS planı (`TRIAL`, `BASIC`, `PRO`, `ENTERPRISE`) için standart bir modül/yetenek matrisi bulunur. Kiracı oluşturulduğunda (provision) veya plan güncellendiğinde bu matris temel alınır; platform yöneticisi gerektiğinde kiracı bazında tekil modül override'ı tanımlayabilir.

**Acceptance Criteria**:
1. `TRIAL`: Temel operasyon, kayıt, formlar, finans ve iletişim açık; ileri düzey modüller (b2b, floor studio, otel vb.) kısıtlı.
2. `BASIC`: Standart etkinlik modülleri açık.
3. `PRO`: Bilimsel, sponsorluk, konaklama, yaka kartı dahil tam etkinlik paketi açık.
4. `ENTERPRISE`: Tüm 26 modül ve 17 capability açık.

---

### User Story 4 — İstemci Arayüzünde Kilitli Modül Gösterimi (Priority: P2)
Etkinlik edisyon sihirbazında (`editions.tsx`) ve yetenek ayarlarında, kiracının platform yetkisi olmayan modüller kilitli (`disabled` veya rozetli) gösterilir, kullanıcının başarısız istek atması önlenir.

---

## 3. Güvenlik ve Hata Durumları (Edge Cases)

1. **Geri Çekme (Revocation) Durumu:** Firma A bir kiracının `SCIENTIFIC` modülünü iptal ederse:
   - Mevcut açık edisyonlardaki eski veriler silinmez (veri kaybı yok).
   - Yeni edisyonlarda bu yeteneğin açılması engellenir.
   - İlgili modülün API uçlarına gelen yazma istekleri `403 Forbidden` ile fail-closed olur.
2. **Auth-Off / Demo Modu Uyumu:** Demo kipinde veya test ortamında geriye dönük testlerin kırılmaması için test kiracıları veya demo kiracıları varsayılan olarak `PRO` seviyesinde değerlendirilir.
3. **Audit İzi:** Tüm yetki değişiklikleri `ActivityLog` içinde kaydedilir.
