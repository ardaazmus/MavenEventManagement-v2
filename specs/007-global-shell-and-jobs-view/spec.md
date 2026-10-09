# Spesifikasyon: 007 — Firma B Global Shell ve İş Portföyü (Faz 2)

**Referans Belge:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` (Bölüm 2.1, 2.2, Faz 2) ve `06-UI-UX-PWA-INFORMATION-ARCHITECTURE.md` (Bölüm 2.1, 3)  
**Faz:** Faz 2 — Firma B global shell ve iş portföyü  
**Hedef Kapsam:** Firma B için dar sabit global ikon şeridi ve bağlamsal ikinci sol menünün hayata geçirilmesi; "İşler ve Organizasyonlar" ana sayfasının (durum filtreleri, kart/liste görünümü, arama, dikkat gerekenler ve iş kartı eylemleri) kurulması.

---

## 1. Kullanıcı Senaryoları ve İhtiyaçlar

### Senaryo 1: Çift Sol Menü ile Sade ve Bağlamsal Gezinme
- **Kullanıcı:** Firma B yöneticisi veya etkinlik koordinatörü.
- **İhtiyaç:** Tüm 26 modülü tek bir uzun listede görmek yerine, sol tarafta dar bir global ikon şeridi (5 ana alan) ve yanında seçili alana göre değişen düzenli bir ikinci menü görmek.
- **Beklenti:**
  - `jobs` (İşler ve Organizasyonlar) seçildiğinde iş listesi durum filtreleri,
  - `portfolio` (Firma Portföyü) seçildiğinde kişi ve kurum ana kayıtları menüsü,
  - `comms` (Genel İletişim) seçildiğinde kurumsal iletişim menüsü,
  - `reports` (Firma Raporları) seçildiğinde çapraz raporlar menüsü,
  - `settings` (Firma Ayarları) seçildiğinde kurumsal ayarlar menüsü görünmelidir.

### Senaryo 2: "İşler ve Organizasyonlar" Ana Ekranı
- **Kullanıcı:** Firma B proje sorumlusu.
- **İhtiyaç:** Giriş yapıldığında doğrudan tüm işlerin ve organizasyonların özetini, yaşam döngüsü durumlarını (Aktif, Planlanan, Dikkat Gereken, Tamamlanan, Arşiv) ve sıradaki adımlarını görebilmek.
- **Beklenti:**
  - Arama çubuğu ile iş adı, şehir ve müşteri adına göre anında filtreleme.
  - Kart ve liste görünümü arasında geçiş imkânı.
  - Belirgin "Yeni İş" birincil eylemi (Primary CTA).
  - Her iş kartında: iş adı, iş türü ve profili, yaşam döngüsü rozeti, tarih/konum, müşteri kurumu, sorumlu personel, açık modül özeti ve hızlı eylem butonları ("İşi Aç", "Kuruluma Devam Et", "İş Ayarları").
  - "Dikkat Gerekenler" şeridi: Eksik kurulum adımı veya geciken onayları olan işleri öne çıkarma.

---

## 2. Kabul Kriterleri (Acceptance Criteria)

1. **Dar Sabit Global İkon Şeridi:**
   - Solda ~56-64px sabit genişlikte dikey ikon şeridi bulunmalıdır.
   - 5 ana global alan (`jobs`, `portfolio`, `comms`, `reports`, `settings`) dikey sırada yer almalı, aktif alan açıkça vurgulanmalıdır.
   - Alt kısımda Yardım ve profil göstergeleri yer almalıdır.

2. **Bağlamsal İkinci Menü:**
   - İkon şeridinin hemen sağında seçili global alana ait alt başlıkları barındıran ikincil navigasyon paneli yer almalıdır.
   - Bir iş açıldığında (iş bağlamı) bu panel, işin 9 grubunu veya iş içi navigasyonunu destekleyecek esneklikte olmalıdır.

3. **İşler ve Organizasyonlar Ana Görünümü (`JobsView`):**
   - Sayfa başlığı, arama kutusu ve "Yeni İş" butonu bulunmalıdır.
   - Yaşam döngüsü durum sekmeleri (`Tümü`, `Aktif`, `Planlanan`, `Dikkat Gereken`, `Tamamlanan`, `Arşiv`) çalışmalıdır.
   - İş kartlarında tür, profil, müşteri, sorumlu ve tarih/şehir doğru şekilde listelenmelidir.
   - "İşi Aç" tıklandığında seçili işin bağlamına geçilmeli, "Kuruluma Devam Et" kurulum kontrol listesine yönlendirmelidir.
   - Sıfır iş durumunda yönlendirici boş durum rehberi gösterilmelidir.

4. **Kayıpsızlık ve Geriye Uyum:**
   - Mevcut tüm 26 modül ve sayfalar yeni shell altından erişilebilir kalmalıdır.
