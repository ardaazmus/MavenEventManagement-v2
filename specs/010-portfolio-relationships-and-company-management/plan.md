# Uygulama Planı: 010 — Portföy, İlişkiler ve Firma Yönetimi (Faz 5)

## 1. Mimari Tasarım

### A. Global Portföy Görünümü (`PortfolioView`)
- Mevcut `PeopleView` ve `OrganizationsView` bileşenlerinin temel veri sağlayıcılarını koruyarak, yeni ve birleşik bir portföy deneyimi sunan `src/components/maven/views/portfolio-view.tsx` bileşeni oluşturulacaktır.
- 4 Ana Görünüm Sekmesi:
  1. `people`: Gerçek kişi ana kayıtları (360 profil detayı, çift tık düzenleme, mükerrer analizi).
  2. `organizations`: Tüzel kurum ana kayıtları (360 kurum detayı, sektör ve logo).
  3. `clients`: Müşteri kurumlar ve temsilcileri (Firma B ile ilişkili işler listesi, müşteri portalı bağlantıları).
  4. `relationships`: Çapraz rol matrisi (`CLIENT`, `ORGANIZER`, `PARTICIPANT`, `SPONSOR`, `SUPPLIER`, `STAFF`).
- Global ikon şeridinde `portfolio` tıklandığında bu görünüme yönlendirilir.

### B. Firma Ayarları Görünümü (`CompanySettingsView`)
- `src/components/maven/views/company-settings-view.tsx` bileşeni oluşturulacaktır.
- 7 ana sekme/akordeon yapısı:
  - `profile`: Firma Profili (`TenantIdentityCard`, `LanguageCard`).
  - `staff-teams`: Çalışanlar ve Ekipler (`UserAdminCard`).
  - `departments`: Departmanlar (Kongre, Fuar, Kurumsal, Operasyon, Finans).
  - `roles-access`: Roller ve Erişim (`RolePermissionsMatrix`).
  - `templates`: Genel Şablonlar (6 ana iş şablonu ve varsayılan yetenek setleri).
  - `comms-consent`: İletişim ve İzinler (KVKK / İYS onay politikası).
  - `integrations-compliance`: Entegrasyonlar ve Uyumluluk (`ExportHubCard`, `AnnounceAdminCard`, Güvenlik).
- Global şeritte `settings` tıklandığında ve iş dışı bağlamdayken `CompanySettingsView` açılır.
- Bir iş seçiliyken `settings` modülü açıldığında ise doğrudan işe özel ayarlar (`WorkSettingsView` - Etkinlik kimliği, tarihler, bu işte açık modüller/yetenekler) açılır.

### C. Modül ve Navigasyon Bağlantısı
- `src/lib/module-components.tsx`:
  - `portfolio` anahtarı eklenir veya `people` portföy görünümüne yönlendirilir.
  - `company-settings` anahtarı eklenir.
- `src/components/maven/navigation/dual-sidebar.tsx`:
  - `portfolio` seçildiğinde `portfolio` modülüne, `settings` seçildiğinde (iş seçili değilse) `company-settings` modülüne yönlendirme sağlanır.

---

## 2. Riskler ve Uyumluluk
- `tests/ui-corrections.spec.ts` ve diğer regresyon testleri: Mevcut `people`, `organizations` ve `settings` testlerinin kırılmaması için URL ve modül parametrelerinin geriye dönük uyumlu kalması sağlanmalıdır.
- Hardcoded metin taraması (`i18n:scan`): Tüm etiketler `_new/` sözlüklerinde tanımlanacaktır.
- Mimari bağımlılık (`depcruise`): Dairesel bağımlılık yaratılmayacaktır.
