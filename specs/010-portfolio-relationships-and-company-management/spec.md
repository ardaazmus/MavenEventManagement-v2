# Şartname: 010 — Portföy, İlişkiler ve Firma Yönetimi (Faz 5)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` Faz 5 gereksinimlerini karşılamak üzere:
1. Kişi ve kurum ana kayıtlarını (`PORTFOLIO_RECORD`) Firma B Global Portföyü altında yapılandırır.
2. Portföy Ana Kaydı (Global) ile İş İlişkisi / Katılımı (`WORK_RELATIONSHIP` / `WORK_PARTICIPATION`) kavramsal ve görsel ayrımını kesinleştirir.
3. Müşteri, düzenleyen, katılımcı, sponsor, tedarikçi ve ekip ilişkilerini hem portföy düzeyinde hem de iş bağlamında görüntüler.
4. Çalışan / departman / firma rolü / iş sorumluluğu ve görev ataması akışlarını birbirinden ayırır.
5. Firma Ayarları ekranını 7 ana başlık altında sıralar (Firma Profili, Çalışanlar/Ekipler, Departmanlar, Roller/Erişim, Genel Şablonlar, İletişim/İzinler, Entegrasyonlar/Uyumluluk) ve işe özel ayarlardan (`WorkSettings`) ayırır.

---

## 2. Kullanıcı Senaryoları ve Kabul Kriterleri (Acceptance Criteria)

### Senaryo 1: Global Portföy Gezinimi ve Ana Kayıtlar
- **Kabul Kriteri 1.1:** Sol global şeritten "Firma Portföyü" (`portfolio`) tıklandığında `PortfolioView` açılır.
- **Kabul Kriteri 1.2:** Portföy görünümü 4 temel sekme sunar:
  - **Kişiler (People):** Firma B'nin portföyündeki tüm gerçek kişiler, iletişim bilgileri, unvanları ve katıldıkları iş sayısı.
  - **Kurumlar (Organizations):** Tüzel kişi, dernek, şirket ve kurum ana kayıtları, sektör ve iş ortaklığı sayısı.
  - **Müşteriler (Clients):** Firma B'nin iş yaptığı müşteri kurumları, temsilcileri, aktif/tamamlanan işleri ve müşteri portalı erişim durumu.
  - **İş İlişkileri (Relationships):** Çapraz ilişki matrisi: bir kişi/kurumun hangi işlerde hangi rolde (`CLIENT`, `ORGANIZER`, `PARTICIPANT`, `SPONSOR`, `SUPPLIER`, `STAFF`) yer aldığı.

### Senaryo 2: Portföy Kaydı vs İş İlişkisi Ayrımı
- **Kabul Kriteri 2.1:** Bir kişinin portföy kaydında yapılan düzenleme (örn. telefon, e-posta, unvan) tüm işlerde geçerli ana kimliği günceller.
- **Kabul Kriteri 2.2:** Bir kişinin belirli bir işteki rolü (örn. X Kongresi'nde Konuşmacı, Y Zirvesi'nde Katılımcı) iş ilişkisi olarak izole kalır ve portföy ana kaydını bozmaz.

### Senaryo 3: Çalışan, Departman ve Firma Rolü Hiyerarşisi
- **Kabul Kriteri 3.1:** Çalışanlar (`STAFF`) firma bünyesindeki iç personel olarak tanımlanır.
- **Kabul Kriteri 3.2:** Departmanlar (Kongre Departmanı, Fuar Departmanı, vb.) iş atamalarında organizasyonel birim olarak kullanılır.
- **Kabul Kriteri 3.3:** Firma Rolü (`ORG_OWNER`, `STAFF`, `OBSERVER`) platform/kiracı yetkisini belirlerken; İş Sorumluluğu (Proje Lideri, Operasyon Sorumlusu) iş bazlı operasyonel rolü belirler.

### Senaryo 4: Firma Ayarları (Company Settings) Modülü
- **Kabul Kriteri 4.1:** Global şeritten "Firma Ayarları" (`settings`) tıklandığında veya üst düzey ayarlara geçildiğinde `CompanySettingsView` görüntülenir.
- **Kabul Kriteri 4.2:** Firma Ayarları 7 ana bölüme ayrılır:
  1. Firma Profili (Kimlik, unvan, marka, logo, varsayılan para birimi, dil/tema)
  2. Çalışanlar ve Ekipler (Personel yönetimi, davetler, erişimler)
  3. Departmanlar (Departman yapılanması ve liderleri)
  4. Roller ve Erişim (Kiracı ve sistem rolleri, izin matrisi)
  5. Genel Şablonlar (Varsayılan iş ve form şablonları)
  6. İletişim ve İzinler (KVKK / İYS onay politikası)
  7. Entegrasyonlar ve Uyumluluk (API, Webhook, Denetim Kütüğü)
- **Kabul Kriteri 4.3:** Bir iş seçili olduğunda açılan "İş Ayarları" (`WorkSettingsView`), firma ayarlarından bağımsız olarak yalnızca o işin kimliğini, tarihlerini ve açık modüllerini/yeteneklerini yönetir.
