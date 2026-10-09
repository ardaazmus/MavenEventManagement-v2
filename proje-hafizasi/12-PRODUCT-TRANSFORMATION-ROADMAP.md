# Ürün Dönüşüm Yol Haritası — Maven Event Management V2

**Kapsam:** Yalnız yeni ürün mimarisi, UI/UX, menü hiyerarşisi, modül sahipliği ve kullanıcı akışları.  
**İncelenen checkout:** D:\project\MavenEventManagment_v2  
**Kapsam dışı:** Test, teknik doğrulama, migration, güvenlik denetimi, performans, release, altyapı ve deployment işleri.

Bu belge yapılacak işi tarif eder; yapılmış iş veya doğrulama sonucu değildir.

## 1. Ürün mimarisi

    Firma A — Maven platformunun ürün sahibi
    └── Firma B — platformu kullanan organizasyon şirketi
        ├── Firma profili, çalışanlar, departmanlar ve firma ayarları
        ├── Firma portföyü: kişi ve kurum ana kayıtları, müşteri ilişkileri, segmentler
        └── İşler
            ├── iş türü: kongre, fuar, kurumsal etkinlik, düğün, seyahat, özel iş
            ├── iş profili: tek kişi/grup, standart/VIP, genel/özel
            ├── iş ilişkileri: müşteri, düzenleyen, katılımcı, sponsor, tedarikçi, ekip
            ├── işte etkinleştirilen modüller
            └── işin dış deneyimleri ve yayınları

Kişi/kurum ana kaydı Firma B portföyünde yaşar; o kişinin/kurumun belirli bir işteki rolü ve kayıt bilgisi iş ilişkisidir. İş türü ve profili modül değildir. Firma A ürün kapsamını sunar, Firma B kullanacağı ürün alanlarını seçer, her iş de kendi modüllerini açar. Firma A yönetimi Firma B admin menüsüne karışmaz. Katılımcı, sponsor, iş ortağı ve müşteri ekranları Firma B iç menüsünün devamı olmaz.

### Güncel ürün yapısında görülen başlangıç noktası

Kaynak uygulamada constants içindeki tek modül/grup listesi shell içindeki tek sürekli sol menüyü kuruyor. Üst bağlam tenant, seri ve edisyonu bir arada gösteriyor; modül seçimi global modül durumunu değiştiriyor. Bugünkü yedi grup: Genel Bakış, Etkinlik Kurulumu, CRM, Kayıt, Program, Sponsor/Katılım ve Lojistik. Bu yapı etkinlik operasyonuna odaklı; Firma B portföyünü, tüm iş listesini ve tek bir işin modüllerini ayrı çalışma bağlamları olarak ayırmıyor.

## 2. Hedef navigasyon

### 2.1 Firma B global çalışma alanı

Masaüstünde solda dar sabit global ikon şeridi, yanında seçili alanın bağlamsal ikinci menüsü, sağda içerik bulunur. İlk açılış Firma B için İşler ve Organizasyonlar ana ekranıdır. Bir iş açılmadan o işe ait modül menüsü görünmez.

Global şerit sırası:

1. İşler ve Organizasyonlar
2. Firma Portföyü
3. Genel İletişim
4. Firma Raporları
5. Firma Ayarları
6. Yardım ve kullanıcı profili alt bölümde

Üst çubukta Firma B kimliği, global arama/komut, bildirimler, dil ve profil yer alır.

| Global alan | İkinci menü | Kullanım |
|---|---|---|
| İşler ve Organizasyonlar | İşlerim; Aktif; Planlanan; Dikkat Gereken; Tamamlanan; Arşiv; Departmanlar; Kayıtlı Görünümler | Aynı iş listesinin filtre ve görünümleri. Bir iş seçilince iş bağlamına geçer. |
| Firma Portföyü | Kişiler; Kurumlar; Müşteriler; İlişkiler; Segmentler; Portföy Formları | Firma B’nin kalıcı ana kayıtları. İş katılımı/ilişkisi ayrı görünüm olarak açılır. |
| Genel İletişim | Genel Bakış; Kitleler; Segmentler; Kampanyalar; Şablonlar; Onaylar; Gönderim Geçmişi | Firma B’nin işlerden bağımsız iletişimi. |
| Firma Raporları | Portföy; İş Portföyü; Operasyon; Finans; İletişim; Dışa Aktarımlar | Firma çapraz iş görünümü; satırdan kaynak işe dönülür. |
| Firma Ayarları | Firma Profili; Çalışanlar ve Ekipler; Departmanlar; Roller ve Erişim; Modüller; Genel Şablonlar; İletişim ve İzinler; Entegrasyonlar; Uyumluluk | Firma genel varsayılanları. İşe özel ayarlar İş Ayarları’ndadır. |

### 2.2 İşler ve Organizasyonlar ana sayfası

Üst bölümde sayfa adı, iş araması ve tek belirgin Yeni İş eylemi bulunur. Hemen altında Aktif, Planlanan, Dikkat Gereken, Tamamlanan ve Arşiv görünümleri vardır. Ana içerik liste/kart görünümü arasında seçilebilir.

Her iş satırı/kartı: iş adı, tür ve profil, yaşam döngüsü durumu, tarih ve saat dilimi, şehir/mekân veya seyahat aralığı, müşteri/düzenleyen, Firma B sorumlusu/departmanı, işte açık modüllerin kısa özeti, sıradaki kurulum/karar ve son hareketi gösterir. Kullanıcı seçtiği işe geçer; Devam Et kurulumdaki sonraki adıma, Aç İş Özeti’ne, Ayarlar İş Ayarları’na götürür. Boş durumda sahte KPI panosu değil ilk iş türünü seçtiren yönlendirme görünür.

İşler ana sayfasındaki Dikkat Gerekenler özeti gecikmiş görev, bekleyen karar, süresi yaklaşan belge veya başarısız iletişimi ilgili işe ve yapılacak eyleme bağlar. Arşivlenmiş iş bugünkü canlı operasyon gibi gösterilmez.

### 2.3 İş alanında ikinci menü

Global şerit görünür kalır. İkinci menünün üstünde iş adı, tür/profil ve durum bulunur. Gruplar ve sıra sabittir:

1. **İş Yönetimi:** İş Özeti; Kurulum Kontrol Listesi; İş Bilgileri; Müşteri ve Düzenleyen; Ekip ve Yetkiler; Görevler ve Onaylar.
2. **Kişiler ve Kayıt:** Kişiler ve Kurumlar; Katılımcılar; Kategoriler ve Haklar; Formlar; Onay Merkezi; İçe/Dışa Aktarım.
3. **Program ve İçerik:** Bilimsel; Program; Sosyal ve Tur Planı.
4. **Sponsor ve Fuar:** Sponsorlar; Paketler ve Anlaşmalar; Haklar ve Teslimatlar; Stantlar/Floor Studio; B2B.
5. **Mekân ve Saha:** Mekânlar ve Alanlar; Saha Operasyonu; Yaka Kartları ve Baskı; Belgeler ve Sertifikalar.
6. **Konaklama ve Hizmetler:** Konaklama; Seyahat ve Transfer; Ek Hizmetler.
7. **İletişim ve Deneyim:** İş İletişimi; Dış Deneyimler; Medya.
8. **İş Raporları.**
9. **İş Ayarları.**

İç menü öğeleri teknik registry adıyla değil kullanıcının işiyle adlandırılır. Kullanılmayan modülün yerine ilgisiz öğe konmaz. Gruplar kapatılabilir ama iş içindeki konum kaybolmaz. Mobilde masaüstü menülerini dar ekrana sıkıştırmak yerine global ve iş menüsü ayrı çekmece/geri gezinme katmanları olarak açılır.

### 2.4 İş Özeti

Bir iş açıldığında kullanıcı ham bir modül tablosuna değil İş Özeti’ne gelir. Üstte işin kimliği, tür/profil, durumu, tarih/konumu, müşteri ve sorumlu ekip bulunur. İçerik karar ve sıradaki iş odaklıdır:

- İşin kurulum durumu ve tamamlanmamış temel bilgiler.
- Sorumlu ve tarihiyle sıradaki görevler.
- Kaynak modülünü belirten bekleyen kararlar.
- Yalnız bu işte açık modüllerin kısa durumları.
- İşe ait son hareketler ve iletişimler.
- Yayındaki dış deneyimlerin durumu ve önizleme bağlantısı.

Her satır sahibinin modülüne gider. Aynı sayı farklı kartlarda yinelenmez. Tamamlanmış işte canlı sayaçlar yerine sonuç/kapanış bilgisi gösterilir.

### 2.5 Firma A çalışma alanı

Firma A ayrı platform çalışma alanıdır. Tenant hesapları, ürün modülleri ve Firma B’ye sunulan ürün kapsamı burada yönetilir. Firma B kullanıcı arayüzüne platform işlemleri/ayarları eklenmez. Bu yol haritası Firma A’nın ürün sınırını tanımlar; operatör panelinin ekran detayları ayrı ürün işidir.

## 3. Yeni İş akışı

Yeni İş, global İşler ekranındaki tek ana eylemdir. Akış kısa ve koşulludur:

1. İş grubu: Etkinlik/Organizasyon; Seyahat/Müşteri İşi; Özel İş.
2. İş türü veya şablon: Kongre, fuar, kurumsal etkinlik, düğün, bireysel/grup seyahati, özel.
3. Ad, tarih/aralık, saat dilimi ve yer/rota.
4. Müşteri işi ise Firma Portföyü’nden kurum/kişi seçme veya yeni kayıt; işte görünen rol adını belirleme.
5. İş profili: bireysel/grup, standart/VIP, genel/özel ve Firma B’nin kendi işi/müşteri işi.
6. Şablonun önerdiği modülleri ve her birinin işlevini gösterme.
7. İş sahibi, departman ve başlangıç ekibi.
8. Gözden geçirme ve Taslak Oluştur.

İş oluşturulunca kullanıcı İş Özeti’ne alınır. Kurulum Kontrol Listesi, modüllerin ihtiyaçlarına göre adımları getirir. Adımlar zorunlu/sıradaki/isteğe bağlı olarak anlaşılır biçimde ayrılır; her adım kısa açıklama, örnek ve neden bilgisini taşır. Kurulum listesi wizard’ın uzatılmış hali değildir. Kullanıcı başka alana geçip geri geldiğinde aynı iş ve kaldığı adım görünür.

## 4. Modül ve menü başına hedef

Bu tablo güncel constants içindeki 26 ana menü modülünü, görünür ekran karşılığını ve hedef yerini eşler. Modülün kullanıcıya ait işi korunur; menüde tek başına durması zorunlu değildir.

| Mevcut modül | Bugünkü işlevin ürün karşılığı | Hedef konum ve akış |
|---|---|---|
| Genel Bakış / dashboard | Firma özeti, seçili edisyon KPI’ları, görevlere ve modüllere kestirmeler | Firma B’de İşler listesi; iş içinde İş Özeti. Firma çapraz sayıları iş KPI’larından ayrılır. |
| Operasyon / operations | Görev, tedarikçi ve lojistik takibi | İş Yönetimi → Görevler ve Onaylar. Global bana atananlar iş ana sayfasında özetlenir; görev kaynak modülüne bağlı kalır. |
| Arşiv / archive | Tamamlanan edisyon ve arşiv içeriği | İşler → Arşiv filtresi. Geçmiş kayıtlar ilgili işin kapanış bağlamında açılır. |
| Etkinlikler / editions | Seri/edisyon, yaratma, kopyalama, kimlik ve arşiv | İşler ve Organizasyonlar. Kongre serisi/edisyon geçmişi iş kaydının alt ilişkisi olur; iş türleri etkinlik dışına açılır. |
| Ayarlar / settings | Firma ve etkinlik kimliği, dil/tema | Firma Ayarları’nda firma profili/varsayılanlar; İş Ayarları’nda iş kimliği, tarih/yer, modüller ve yayın. |
| Dış Portal / portals | Katılımcı, sponsor, vitrin ve portal ayarları | İş → İletişim ve Deneyim → Dış Deneyimler. Firma varsayılan markası Firma Ayarları’nda; dış kullanıcı menüleri birbirinden ayrı. |
| Uyumluluk / compliance | Veri talepleri, belge, yargı alanı ve politika | Firma Ayarları → Uyumluluk; işe/katılımcıya ait belge ilgili iş alanına bağlanır. |
| API Geçidi / integrations | Ödeme, mail, REST ve webhook bağlantıları | Firma Ayarları → Entegrasyonlar; işe atanmış hizmet İş Ayarları’nda, sonucu kaynak modülde görünür. |
| Kişiler / people | Kişi kaydı, roller, özel alan, ekleme/ithal/birleştirme | Global Firma Portföyü → Kişiler; iş içinde yalnız o işe ait ilişki/katılım görünümü. |
| Kurum/Kuruluşlar / organizations | Kurum ana kaydı ve ilişkili kişiler | Global Firma Portföyü → Kurumlar/Müşteriler; iş içinde Müşteri ve Düzenleyen veya Kişiler ve Kurumlar. |
| İletişim / communications | Etkinliğe bağlı kampanya ve gönderimler | İş → İletişim ve Deneyim → İş İletişimi. Hedef kitle ve geçmiş seçili işte kalır. |
| Şirket İletişimi / company-communications | Firma çapında müşteri teması ve kampanyalar | Global Genel İletişim. Firma portföyü/segmentleri kullanır; iş katılımcısı oluşturmaz. |
| Kayıt & Katılımcılar / registrations | Kayıt, başvuru, kategori, bekleme, delege/refakatçi, import | İş → Kişiler ve Kayıt → Katılımcılar, Kategoriler ve Haklar, Onay Merkezi. Başvuru → karar → iş katılımı akışı belirginleşir. |
| Form Merkezi / forms | Şablon, stüdyo, yanıt ve canlı görünüm | İş → Kişiler ve Kayıt → Formlar. Firma şablonundan işe uyarla; yayın → yanıt → karar/sonuç. |
| Ödeme & Ek Hizmet / finance | Sipariş, ödeme, iade ve ücretli hizmet | İş Finansmanı: Siparişler, Ödemeler, İadeler, Ek Hizmetler. Ücret hizmetin sahibi modüle bağlanır. |
| Muhasebe / accounting | Gelir/gider, defter, mutabakat ve rapor | İş Raporları → Finans. Firma çapraz iş görünümü Firma Raporları’nda; operasyonel tahsilattan ayrılır. |
| Bilimsel / scientific | Bildiri, yazar, hakem, değerlendirme, karar, CME | Program ve İçerik → Bilimsel. Gönderi → hakem → karar; kabul edilen içerik Program’a aktarılır. |
| Program / program | Oturum, salon, atama ve çizelge | Program ve İçerik → Program. Oturum/konuşmacı/zaman/oda/çakışma/yayın tek akışta. |
| Sosyal & Tur Planı / social | Gala, yemek, tur ve sosyal etkinlik | Program ve İçerik → Sosyal ve Tur Planı. Ana programla bağlantılı, kendi katılım planı olan görünüm. |
| Sponsor & Fuar / sponsorship | Sponsor, paket, anlaşma, hak, teslimat, ROI | Sponsor ve Fuar: Sponsorlar → Paketler ve Anlaşmalar → Haklar ve Teslimatlar. Kurum portföy ilişkisi kullanılır. |
| B2B Planı / b2b | B2B planı, eşleşme ve görüşme | Sponsor ve Fuar → B2B. Eşleşme → karşılıklı kabul → görüşme; katılımcı ve sponsor dış alanına bağlanır. |
| Floor Studio / floors | Fuar planı ve stant alanı | Sponsor ve Fuar → Stantlar/Floor Studio; Mekân ile bağlı. Hak → tahsis → yerleşim → dışarıya açık görünüm. |
| Medya Arşivi / media | Firma/iş dosyaları, görsel ve medya dışa aktarımı | Firma marka kitaplığı ve iş medyası ayrılır. İş içi Medya, dosyanın modül ve dış içerik bağını gösterir. |
| Konaklama / accommodation | Otel, oda türü, blok, gece stoku, rezervasyon | Konaklama ve Hizmetler → Konaklama. Talep → kapasite/rezervasyon → yolcunun görünümü ve ilişkili ödeme. |
| Sahada / onsite | Check-in, tarama, kiosk, alan geçişi | Mekân ve Saha → Saha Operasyonu. Ön hazırlık ile etkinlik günü hızlı görev görünümü ayrılır. |
| Yaka Kartı Baskı / badges | Profil/tasarım, kart ve basım kuyruğu | Mekân ve Saha → Yaka Kartları ve Baskı. Katılımcı → baskıya hazır profil → basım/teslim → saha girişi. |
| Belgeler / certificates | Sertifika tanımı, uygunluk, üretim ve teslim | Mekân ve Saha → Belgeler ve Sertifikalar. Katılım/başarı → belge → kişinin kendi dış alanında görüntüleme. |

### 4.1 Ayrı ana menü olmayan mevcut yetenekler

| Mevcut yetenek | Hedef yer | Kullanıcı sırası |
|---|---|---|
| Çalışan, davet, departman, özel rol ve ekip | Firma Ayarları → Çalışanlar ve Ekipler; İş → Ekip ve Yetkiler | Çalışanı ekle → departmana bağla → firma rolü → işe ata → görev sorumlusu. |
| Portföy segmenti ve ilişki | Firma Portföyü → Segmentler/İlişkiler | Ana kaydı bul → ilişkiyi gör → segment oluştur → iletişim veya iş bağlamına geç. |
| Onay ve kararlar | İş → Görevler ve Onaylar; kayıt için Onay Merkezi; ödeme için Finans | Bekleyen işi kaynak modülüyle bul → incele → karar ver → ilgili sonuca dön. |
| Bildirim ve duyurular | Global bildirim merkezi; iş duyurusu İş İletişimi | Bildirim doğru firma/iş bağlamını açar. |
| Marka, özel alan ve şablonlar | Firma Ayarları ve İş Ayarları | Firma varsayılanını oluştur → işe uygula/özelleştir → dış yüzey önizlemesi. |
| İçe/dışa aktarma | Kişi, Katılımcı, Form, Sponsor veya Finans ekranında | Kaynak listesinden başlat → alan/kapsamı belirle → sonucu aynı bağlamda gör. |
| Outbox, webhook ve entegrasyon kayıtları | Firma Ayarları → Entegrasyonlar; sonuç kaynak modülde | Bağlantıyı firmada yönet → işe bağla → işlem sonucunu modülde gör. |
| Firma vitrini ve iş portalları | Vitrin firma profili; iş portalı İş → Dış Deneyimler | Firma varsayılanı → işte açılan yüzey → o yüzeyin önizlemesi. |
| UTM/tanıtım kaynağı | Genel İletişim veya İş İletişimi → Kampanya | Kampanya → kayıt/sonuç → kampanya ve iş raporu. |

## 5. Modüller arası iş akışları

1. **Firma kuruluşu → ilk iş:** Firma Profili → çalışan/departman → şablon → Yeni İş → müşteri/iş sahibi → İş Özeti → kurulum listesi.
2. **Portföy → iş ilişkisi:** Kişi/kurum ana kaydı → işteki rol → katılım/sponsor/müşteri/tedarikçi görünümü. Ana kayıt kimliği değişmez.
3. **Form → iş sonucu:** Şablon → işte yayın → yanıt kutusu → inceleme → katılımcı/portföy adayı/hizmet talebi gibi doğru sahip alana aktarım.
4. **Katılımcı → saha:** Kayıt kategorisi/hak → başvuru/karar → katılımcı → yaka kartı → saha girişi → katılım/sertifika sonucu.
5. **Bilimsel → program:** Bildiri → hakem/karar → oturum/konuşmacı → yayımlanmış program → mobil/kişisel program.
6. **Sponsor → fuar/B2B:** Portföy kurumu → işte sponsor rolü → paket/anlaşma → hak/teslimat → stand → B2B görüşmesi → gerçekleşme/ROI.
7. **Talep → hizmet/finans:** Kayıt veya hizmet talebi → sahibi modülde kapasite/rezervasyon → sipariş/ödeme → hizmet ifası → muhasebe/İş Özeti.
8. **İş içeriği → yayın:** Yayımlanabilir içerik → iş kitlesi → İş İletişimi → dış deneyim → kaynak modüle dönüş.
9. **Modüller → İş Özeti:** Her modül sıradaki işi ve kısa durumu verir; özet karar ekranıdır, modül verisinin sahibi değildir.
10. **İş → firma raporu/portföy:** İş sonuçları çapraz iş görünümüne yansır; rapordan kaynak iş ve kişilere geri dönülür.

## 6. Görsel ve etkileşim dili

İki kullanıcı görseli yalnız yerleşim ve kalite referansıdır: dar ana ikon şeridi, bağlama özel ikinci menü, ferah içerik, sakin nötr yüzey, net tipografi, az ve anlamlı metadata, ölçülü durum renkleri. Görsellerdeki ürün metinleri, menü adları, veri ve içerik kullanılmayacaktır.

Her ekranda bir ana iş ve birincil eylem bulunur. Kişi/katılımcı tabloları liste veya tablo; program takvim/zaman çizelgesi; iş portföyü liste/kart; saha anlık operasyon görünümü; sponsor teslimatları ilişki/durum listesi olur. Bütün modüller kart veya kanbana çevrilmez. Teknik registry adı, model adı ve capability kodu kullanıcıya gösterilmez. Mobil arayüz masaüstü menüsünün sıkıştırılmış kopyası olmaz.

## 7. Ürün fazları

### Faz 1 — Ürün sözlüğü ve modül sahipliği

- Firma A, Firma B, İş, İş Türü, İş Profili, Portföy Kaydı, İş İlişkisi, Katılım ve Modül kavramlarını kullanıcı dilinde sabitle.
- Edisyon/seri geçmişinin İş içindeki yerini belirle.
- 26 modülün her birine ürün sahibi, global/iş bağlamı ve hedef menü yolunu bağla.
- Ayrı ana menü olmayacak yetenekleri sahibi modül veya ayar alanıyla eşle.

### Faz 2 — Firma B global shell ve iş portföyü

- Global ikon şeridi ve her global alanın ikinci menüsünü oluştur.
- İş listesi, durum görünümleri, arama, departman ve kayıtlı görünüm akışını kur.
- İş öğesinin bilgi sırasını ve birincil eylemlerini düzenle.
- Dashboard, Etkinlikler, Arşiv ve genel Operasyon sorumluluğunu global ve iş alanlarına ayır.
- Portföy, Genel İletişim, Firma Raporları ve Firma Ayarları girişlerini yerleştir.

### Faz 3 — İş shell’i ve İş Özeti

- İş seçilince global şeridi koru ve ikinci menüyü dokuz iş grubuna dönüştür.
- İş başlığı, iş değiştirme, breadcrumb ve yaşam döngüsü bağlamını düzenle.
- İş Özeti’ni kurulum, görev, karar, modül durumu, hareket ve dış yayından oluştur.
- Tamamlanmış/arşivlenmiş iş sunumunu tanımla.

### Faz 4 — Yeni İş wizard’ı ve ilk kurulum

- Sekiz adımlı kısa ve koşullu wizard’ı kur.
- Etkinlik, fuar, kurumsal, düğün, seyahat ve özel başlangıç şablonlarını tanımla.
- Müşteri, profil, modül, iş sahibi ve ekip seçimlerini ayır.
- Taslak sonrası İş Özeti ve ilerlemeli kurulum listesine geçir.
- Her kurulum adımını sahibi modül ekranına bağla; açıklama ve neden bilgisini göster.

### Faz 5 — Portföy, ilişkiler ve firma yönetimi

- Kişi/kurum ana kayıtlarını global portföye yerleştir.
- Müşteri, düzenleyen, katılımcı, sponsor, tedarikçi ve ekip ilişkilerini iş ekranlarında göster.
- Çalışan/departman/firma rolü/iş sorumluluğu/görev ataması akışlarını ayır.
- Firma Profili, Roller/Ekipler, Genel Şablonlar, İletişim, Entegrasyonlar ve Uyumluluk alanlarını Firma Ayarları’nda sırala.
- Firma varsayılanı ve iş özelleştirmesini bağla.

### Faz 6 — Kişiler, kayıt ve formlar

- İşteki kişiler, kurumlar, katılımcı, kategori/hak ve form ekranlarını grupla.
- Form tasarımı, yayın, yanıt kutusu ve canlı görünümü aynı Formlar alanında düzenle.
- Yanıttan incelemeye ve doğru modül sonucuna geçişi kur.
- Import/export’u kaynak ekranlara koy; kişi ana kaydı ile iş katılımını ayır.

### Faz 7 — Bilimsel, program ve sosyal içerik

- Bildiri, hakem, karar ve CME’yi Bilimsel altında grupla.
- Kabulden oturum/konuşmacıya geçişi belirle.
- Programı oturum, salon, konuşmacı, çizelge ve yayın akışında düzenle.
- Sosyal etkinlik/turları aynı iş programıyla ilişkili ayrı katılım alanı yap.

### Faz 8 — Sponsor, fuar, B2B ve medya

- Sponsor ilişkisinden paket/anlaşma, hak/kontenjan ve teslimata sırayla ilerle.
- Stant/Floor Studio tahsisini sponsor hakları ve mekânla bağla.
- B2B eşleşme, karşılıklı kabul ve görüşme çizelgesini tek kullanıcı yolculuğuna getir.
- Firma marka kitaplığı ve işe ait medyayı ayır.
- Sponsor dış portalını Firma B yönetiminden ayrı tut.

### Faz 9 — Mekân, konaklama, seyahat ve saha

- İş mekânını İş Bilgileri ve Saha Operasyonu ile bağla.
- Konaklama talebi, blok/stok, rezervasyon ve yolcu görünümünü sırala.
- Seyahat, transfer ve ek hizmeti talep, sorumlu, teyit ve ifa akışında göster.
- Check-in, tarama, kiosk ve alan operasyonunu saha görünümünde düzenle.
- Yaka kartı/belgeyi katılım ve kişinin dış alanına bağla.

### Faz 10 — İş iletişimi ve dış deneyimler

- Genel İletişim ile İş İletişimi farkını menü ve kitle seçiminde açık tut.
- Genel mobil, kişisel katılımcı, B2B, sponsor/partner ve müşteri-seyahat dış alanlarını ayır.
- İş içeriğinden dış yayın akışını tanımla.
- Firma vitrini ile iş portalını ayrı kullanıcı işlerinde tut.

### Faz 11 — Finans, raporlar ve iş yaşam döngüsü

- Sipariş/ödeme/iade/ek hizmeti; defter/gelir/gider/mutabakatı farklı kullanıcı görünümlerine ayır.
- İş Raporları ve Firma Raporları kapsamını düzenle.
- Raporlardan kaynak iş/modüle dönüş sağla.
- Taslak → planlanan → aktif → tamamlanan → arşiv yaşam döngüsünü tüm iş türlerine uyarla.

### Faz 12 — Birleşik ürün dili ve gezinme

- Firma globali, iş alanı, Firma A ve dış deneyim terminolojisini birleştir.
- Duyuru, bildirim, export, entegrasyon, özel alan ve portal ayarı gibi yetenekleri sahibi ekranlarına yerleştir.
- Her modülün özet, kurulum, iletişim, dış deneyim ve rapor ilişkisini görünür kıl.
- Mobilde aynı hiyerarşiyi görev odaklı yeniden düzenle.
- Kullanıcı görünen adlarını gerçek etkinlik/seyahat iş diline göre belirle.

## 8. Yol haritasına eklenmeyecekler

Test, teknik kontrol, API/DB/migration, güvenlik uygulama planı, performans, CI, deployment, release, production, pilot, ölçüm ve doğrulama kapısı eklenmeyecektir. Antigravity’ye yalnız ürün mimarisi, UI/UX, menü hiyerarşisi, modül sorumluluğu ve iş akışı işleri verilecektir.
