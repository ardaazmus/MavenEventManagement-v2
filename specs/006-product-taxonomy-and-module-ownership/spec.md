# Spesifikasyon: 006 — Ürün Sözlüğü ve Modül Sahipliği (Faz 1)

**Referans Belge:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` (Bölüm 1, 2, 4, 4.1 ve Faz 1)  
**Faz:** Faz 1 — Ürün sözlüğü ve modül sahipliği  
**Hedef Kapsam:** Maven Event Management V2 için yeni ürün mimarisinin, kullanıcı dilindeki temel kavramların, 26 modülün ürün sahipliği ve hedef menü konumlarının, edisyon-iş ilişkisinin ve alt yetenek eşlemelerinin kod düzeyinde sabitlenmesi.

---

## 1. Kullanıcı Senaryoları ve İş Hedefleri

### Senaryo 1: Net ve Ayrışmış Firma A / Firma B / İş Hiyerarşisi
- **Kullanıcı:** Firma B (Organizasyon Şirketi) Yöneticisi ve Operatörü.
- **İhtiyaç:** Platform Sahibi Firma A'nın süper-admin kontrolleriyle karşılaşmadan, kendi firma portföyünü (kişi ve kurum ana kayıtlarını), departmanlarını ve yürüttüğü işleri yönetebilmek.
- **Beklenti:** Bir iş (kongre, fuar, kurumsal etkinlik, seyahat) açılmadan o işe ait operasyonel modüllerin sol menüde kalabalık yapmaması; Firma B portföyünün işlerden bağımsız kalıcı bir veri varlığı olduğunun netleşmesi.

### Senaryo 2: 26 Modülün Kayıpsız Olarak Yeni Düzene Taşınması
- **Kullanıcı:** Etkinlik yöneticisi, kayıt yöneticisi, finans direktörü veya sponsorluk koordinatörü.
- **İhtiyaç:** Eski 7'li düz modül listesindeki işlevlerin hiçbirinin kaybolmadan, kullanıcının gerçek çalışma bağlamına (Global Firma Çalışma Alanı vs. İşe Özel Çalışma Alanı) ve 9 hedef iş grubuna taşınması.
- **Beklenti:** Her modülün ürün sorumluluğu, kullanıcı akışındaki yeri ve hedef navigasyon yolu açık ve tutarlı olmalıdır.

### Senaryo 3: Edisyon ve Seri Geçmişinin İş İçindeki Yeri
- **Kullanıcı:** Firma B proje yöneticisi.
- **İhtiyaç:** "Etkinlikler / editions" kavramının yalnızca kongre serileriyle sınırlı kalmayıp, tekil seyahatleri, kurumsal buluşmaları ve fuarları da kapsayan "İş / Organizasyon" ana kimliğine bağlanması.
- **Beklenti:** Edisyon ve seriler bir işin operasyonel dönemleri ve alt ilişkisi olarak konumlandırılmalı; iş türleri kongre dışındaki tüm organizasyon modellerine hizmet edebilmelidir.

### Senaryo 4: Ayrı Menüsü Olmayan Yeteneklerin Sahiplik Eşlemesi
- **Kullanıcı:** Firma B çalışanları.
- **İhtiyaç:** Çalışan daveti, departman ataması, onay ve kararlar, içe/dışa aktarım ve marka şablonları gibi yeteneklerin bağımsız dağınık menüler yerine doğru sahip modüller ve ayar sekmeleri altında bulunabilmesi.

---

## 2. Kabul Kriterleri (Acceptance Criteria)

1. **Temel Ürün Kavramları Tanımı:**
   - `FIRMA_A`, `FIRMA_B`, `WORK` (İş), `WORK_GROUP`, `WORK_TYPE`, `WORK_PROFILE`, `PORTFOLIO_RECORD`, `WORK_RELATIONSHIP`, `WORK_PARTICIPATION` ve `MODULE` kavramları TypeScript sözleşmeleriyle tanımlanmalıdır.
   - İş türleri en az: Kongre, Fuar, Kurumsal Etkinlik, Düğün, Bireysel/Grup Seyahati ve Özel İş seçeneklerini içermelidir.
   - İş profilleri kapsam (Bireysel/Grup), segment (Standart/VIP), gizlilik (Genel/Özel) ve mülkiyet (Kendi İşi/Müşteri İşi) boyutlarını desteklemelidir.

2. **Global Navigasyon Hiyerarşisi (Firma B Çalışma Alanı):**
   - 5 ana global alan tanımlanmalıdır: `jobs` (İşler ve Organizasyonlar), `portfolio` (Firma Portföyü), `comms` (Genel İletişim), `reports` (Firma Raporları), `settings` (Firma Ayarları).
   - Her global alanın ikinci menü görünümleri `12-PRODUCT-TRANSFORMATION-ROADMAP.md` Bölüm 2.1 ile birebir örtüşmelidir.

3. **İş Navigasyon Hiyerarşisi (İşe Özel İkinci Menü):**
   - Bir iş açıldığında sunulacak 9 sabit iş grubu ve alt menüleri tanımlanmalıdır:
     1. İş Yönetimi (6 öğe)
     2. Kişiler ve Kayıt (6 öğe)
     3. Program ve İçerik (3 öğe)
     4. Sponsor ve Fuar (5 öğe)
     5. Mekân ve Saha (4 öğe)
     6. Konaklama ve Hizmetler (3 öğe)
     7. İletişim ve Deneyim (3 öğe)
     8. İş Raporları
     9. İş Ayarları

4. **26 Modülün Kayıpsız Eşlemesi:**
   - Mevcut sistemdeki 26 ana modülün tamamı ürün adı, sorumluluğu, bağlamı (`GLOBAL` vs `WORK`), hedef menü yolu ve kullanıcı akışındaki rolü ile eşlenmelidir.
   - Hiçbir modül sistem dışı bırakılmamalıdır (kayıpsızlık kuralı).

5. **Ayrı Menü Olmayan Yeteneklerin Eşlemesi:**
   - Çalışanlar, ekipler, departmanlar, onaylar, bildirimler, şablonlar, dışa aktarım, outbox ve portallar sahibi modüllerle eşlenmelidir.
