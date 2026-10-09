# Specification: Rol ve Paydaş Esnekliği (F-06 & CONTEXT.md)

**Status**: Draft  
**Feature ID**: F-06  
**Scope**: Tüzel kişi (kurum) event rol sözlüğü, görünür rol etiket özelleştirmesi, ve istemci/müşteri (CLIENT/Düzenleyen Kurum) dış portal erişim ayrımı.

---

## 1. Problem & Context

1. **Sabit Sözlük vs. Özel Görünüm (UX & Domain)**:
   - Veritabanında `EventOrganizationAssignment.role` sabit sözlükle (HOST, EVENT_OWNER, CLIENT, PCO, CO_ORGANIZER, SCIENTIFIC_OWNER, PUBLIC_AUTHORITY, SUPPORTER, SPONSOR, EXHIBITOR, VENUE, HOTEL, SUPPLIER, MEDIA_PARTNER, ACADEMIC_PARTNER, ASSOCIATION, WORKSHOP_SPONSOR) temsil edilmektedir.
   - Ancak Firma B (Tenant), bir tıp kongresi yaparken `CLIENT` rolünü "Dernek Yönetimi" veya "Bilimsel Dernek", kurumsal bir toplantıda "Müşteri Şirket", bir festivalde ise "Ana Düzenleyici" olarak adlandırmak ister.
   - Semantik anahtar (`CLIENT`) ile görünen ad (custom label/alias) ayrıştırılmalıdır.

2. **Dış Portal Rol Ayrımı (Sponsor vs. Müşteri/Kurum)**:
   - Mevcut portal belirteç (`PortalToken`) kapsamı yalnızca `PARTICIPANT | SPONSOR` ile sınırlıdır.
   - Firma B'nin iş yaptığı müşteri kurum (`CLIENT` / düzenleyen dernek, şirket, fonlayıcı) için özel bir dış portal / executive viewer erişimi bulunmamaktadır.
   - Müşteri kuruma yönetici seviyesinde tam erişim vermek yerine, sadece Firma B'nin belirlediği edisyon özet metriklerini (kayıt sayıları, oturum durumları, genel akış) gösteren, ancak iç kar marjlarını ve personel sırlarını gizleyen daraltılmış bir dış deneyim (`CLIENT` portal tokenı) sunulmalıdır.

---

## 2. User Scenarios

### Senaryo 1: Edisyon Kurum Rolü Tanımlama ve Özel Etiketleme
- Firma B yöneticisi, bir edisyona bir kurum atar (`EventOrganizationAssignment`).
- Sabit rol olarak `CLIENT` seçer, ancak görünen etiket olarak `"Türk Kardiyoloji Derneği (Kongre Sahibi)"` belirler.
- Sistem bu rolün semantik olarak `ORGANIZER / CLIENT` kategorisinde olduğunu anlar, raporlamada ve UI'da özel etiketiyle gösterir.

### Senaryo 2: Müşteri Kurumuna Güvenli Dış Portal Erişimi Açma
- Firma B, müşteri kurum yetkilisine doğrudan admin şifresi vermek istemez.
- Admin panelinden `CLIENT` kapsamlı bir `PortalToken` üretir (`/api/portal/client-grants`).
- Müşteri kurumu temsilcisi, `x-portal-token` veya magic token ile `/api/portal/client` uç noktasına erişir.
- Müşteri, etkinliğin genel durumunu, teyitli kayıt sayılarını ve program özetini görüntüler. İç finansal marjlar ve operasyonel gizli notlar bu yanıtta yer almaz.

### Senaryo 3: Belirteç İptali ve Kapsam İzolasyonu
- Müşteri kurum yetkilisinin süresi bittiğinde veya sözleşme sona erdiğinde yönetici belirteci iptal eder (`revokedAt`).
- İptal edilmiş belirteç veya farklı edisyona ait belirteç derhal `410 Gone` veya `404 Not Found` alır.
- `SPONSOR` belirteci `/api/portal/client` uç noktasına erişemez (`403 Forbidden`).

---

## 3. Acceptance Criteria

- [x] **AC-1 (Rol Sözlüğü ve Kategorizasyon)**: `src/lib/organization-roles.ts` modülü oluşturulacak; sabit rol kümesini, kategori eşlemesini (`ORGANIZER`, `COMMISSIONER`, `PARTNER`, `COMMERCIAL`, `FACILITY`), geçerlilik doğrulamasını (`isValidOrgRole`) ve varsayılan TR/EN etiketlerini sağlayacak.
- [x] **AC-2 (Özel Etiket Çözümleme)**: `resolveOrgRoleDisplay(role, customLabel)` işlevi, özel etiket tanımlanmışsa onu, aksi halde standart sözlük etiketini dönecek.
- [x] **AC-3 (Portal Token Kapsamı Genişletme)**: `PortalTokenScope` türüne `"CLIENT"` eklenecek (`"PARTICIPANT" | "SPONSOR" | "CLIENT"`). Mevcut katılımcı ve sponsor akışları geriye dönük tam uyumlu kalacak.
- [x] **AC-4 (Client Portal Uç Noktası)**: `/api/portal/client` (GET) oluşturulacak. Yalnızca geçerli `CLIENT` kapsamlı `PortalToken` ile erişilecek; edisyon bilgileri, kurum kimliği ve icra özet metriklerini (kayıt sayıları, oturum özetleri) dönecek; iç maliyet ve gizli notları sızdırmayacak.
- [x] **AC-5 (Client Portal Grants Yönetimi)**: `/api/portal/client-grants` (POST, GET, DELETE) uç noktası eklenecek. `requireAdmin()` ile korunacak, sha256 hash güvenliğini uygulayacak ve ActivityLog audit kaydı düşecek.
- [x] **AC-6 (Kalite Kapıları & Sıfır Regresyon)**: Tüm testler (`test:unit`), `typecheck`, `lint`, `i18n:scan`, `lint:arch` ve `policy:check` (tüm yeni rotalar sınıflandırılmış olarak) %100 başarılı olacak.
