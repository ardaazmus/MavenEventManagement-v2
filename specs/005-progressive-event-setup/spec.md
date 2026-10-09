# Specification: Kademeli Etkinlik Kurulum Rehberi / Setup Checklist (F-07)

**Status**: Draft  
**Feature ID**: F-07  
**Scope**: İlk 3 adımlı hızlı taslak sihirbazını bozmadan, sonrasında kademeli yönlendirme, adım açıklamaları ve modül sıçrama bağlantıları sunan akıllı kurulum checklist'i.

---

## 1. Problem & Context

1. **Hızlı Başlangıç vs. Eksik Kurulum İkilemi**:
   - `src/components/maven/views/editions.tsx` içindeki mevcut 3 adımlı sihirbaz (1: Şablon/Seri, 2: Tarih/Mekân, 3: Yetenekler) hızlıca bir taslak edisyon oluşturabilmektedir.
   - Ancak tek bir modalda logo, müşteri kurum ataması, iç ekip görevlendirmesi, sponsorluk paketleri, kayıt kategorileri ve portal ayarlarını zorunlu tutmak başlangıç bariyerini aşırı yükseltir ("analysis paralysis").
   - Taslak oluşturulduktan sonra ise yöneticinin neyi hangi sırayla yapacağını gösteren, yönlendirici ve canlı durumu yansıtan bir rehberlik bulunmamaktadır.

2. **Hedef Model (Progressive Onboarding)**:
   - İlk sihirbaz hızlı kalmalı (taslak yaratma < 30 saniye).
   - Edisyon oluşturulduktan sonra veya detay ekranında durum kaydeden kademeli bir **Etkinlik Kurulum Rehberi (Event Setup Checklist)** sunulmalıdır.
   - Rehber adımları:
     1. `BASICS`: Temel künye & logo/görsel (Branding)
     2. `STAKEHOLDER`: Düzenleyen / müşteri kurum ataması (Client / Commissioner)
     3. `STAFF`: İç operasyon ekibi ve yetkilendirmeler
     4. `REGISTRATION`: Kayıt kategorileri ve ödeme talimatları
     5. `PROGRAM`: Salon ve program oturumları taslağı
     6. `PORTAL`: Katılımcı dış portalı tasarımı ve önizleme
     7. `PUBLISH`: Yayın öncesi engel denetimi ve canlıya alma

---

## 2. User Scenarios

### Senaryo 1: Hızlı Taslak ve Kurulum Paneli Karşılama
- Yönetici 3 adımda yeni bir etkinlik taslağı oluşturur.
- Etkinlik oluştuğunda sistem kurulum panosunda %20 tamamlanma ile Kurulum Rehberini açar.
- Rehber, "Sıradaki Önerilen Adım: Müşteri Kurum Ataması" uyarısını ve ilgili modüle gitme butonunu sunar.

### Senaryo 2: Kademeli Tamamlama ve Modül Yönlendirmesi
- Yönetici "Kayıt Kategorisi Tanımla" adımına tıklar; sistem doğrudan `registrations` modülüne geçiş yapar.
- Yönetici bir kategori ekleyip geri döndüğünde, kontrol listesinde ilgili adım `COMPLETED` olarak yeşile döner.

### Senaryo 3: Yayınlama Öncesi Bütünlük Denetimi
- Tüm zorunlu adımlar tamamlandığında checklist %100'e yaklaşır ve "Yayına Hazır" durumu oluşur.
- Kritik bir engel varsa (örn. tarih çakışması veya ücretsiz olmayan kategoride ödeme talimatı eksikliği), checklist doğrudan bloklayıcı uyarıyı ve düzeltme butonunu gösterir.

---

## 3. Acceptance Criteria

- [x] **AC-1 (Rehber Değerlendirme Motoru)**: `src/lib/events/setup-checklist.ts` modülü oluşturulacak. Edisyonun veritabanı durumunu (logo, müşteri ataması, ekip ataması, kategoriler, oturumlar, portal, readiness) inceleyerek her adımın durumunu (`COMPLETED`, `PENDING`, `OPTIONAL`), tamamlanma yüzdesini ve sonraki önerilen eylemi hesaplayacak.
- [x] **AC-2 (API Uç Noktası)**: `/api/editions/[id]/setup-checklist` (GET) uç noktası eklenecek. `requireStaff()` ve kiracı izolasyonu ile korunacak, yapısal kurulum kontrol listesini dönecek.
- [x] **AC-3 (Route Policy Envanteri)**: Yeni rota `scripts/route-policy.mjs` içinde `STAFF` olarak sınıflandırılacak.
- [x] **AC-4 (UI Kurulum Bileşeni)**: `src/components/maven/views/editions.tsx` ve `src/components/maven/views/setup-checklist-card.tsx` bileşeni eklenecek. İlerleme çubuğu, adım kartları, modül kısayolları ve yönlendirici ipuçları içerecek.
- [x] **AC-5 (Birim ve Sözleşme Testleri)**: `tests-mini/event-setup-checklist.test.mjs` test paketi eklenecek ve tüm adımların doğru hesaplandığı doğrulanacak.
- [x] **AC-6 (Kalite Kapıları & Sıfır Regresyon)**: Tüm testler (`test:unit`), `typecheck`, `lint`, `i18n:scan`, `lint:arch` ve `policy:check` %100 başarılı olacak.
