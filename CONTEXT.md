# Maven Event Management — Domain Context

Bu dosya uygulama kodu veya görev listesi değildir. Projenin iş kavramlarını ve sınırlarını sabitler.

## Temel hiyerarşi

- **Firma A / Platform Sahibi:** Platformun teknik, lisans, global altyapı ve ürün yetkisi sahibidir.
- **Firma B / Tenant:** Platformu kullanan müşteri firmadır. Firma B kendi personelini, işlerini, portföyünü ve dış deneyimlerini yönetir.
- **İş / Organizasyon:** Firma B'nin kendisi veya müşterisi için yürüttüğü her ticari/operasyonel iştir. Kongre, fuar, düğün, kurumsal organizasyon ve tek kişilik seyahat aynı temel iş kavramının türleridir.
- **İş Türü:** İşin kongre, fuar, seyahat veya başka bir organizasyon olduğunu belirtir.
- **İş Profili:** İşin tek kişi/grup, standart/VIP, genel/özel gibi çalışma özellikleridir; ayrı bir modül değildir.
- **Düzenleyen / Müşteri:** İşin Firma B adına veya hesabına yürütüldüğü firma, kurum, dernek, üniversite, kamu kuruluşu ya da kişidir. Etiket Firma B tarafından özelleştirilebilir.

## Kişiler ve portföy

- **Firma B Portföyü:** Firma B'nin geçmiş ve mevcut işlerden biriktirdiği kişi, şirket ve kurum ana kayıtlarıdır. Portföy kaydı tek başına bir iş katılımı değildir.
- **İş İlişkisi:** Bir kişi veya kurumun belirli işteki rolüdür; katılımcı, sponsor, düzenleyen, davetli, tedarikçi veya başka bir özel rol olabilir.
- **İş Katılımı:** Bir kişinin belirli işe kaydı, onay durumu, hakları ve iş kapsamındaki bilgileridir. Aynı kişi farklı işlerde farklı katılım kayıtlarına sahip olabilir.

## Modül ve genişletilebilirlik

- **Platform Yetkisi:** Firma A'nın Firma B'ye açtığı üst sınırdır.
- **Firma Modül Aktivasyonu:** Firma B'nin kendisine açılmış modüller arasından çalışma alanında etkinleştirdikleridir.
- **İş Modül Aktivasyonu:** Firma B'nin belirli bir işte kullanmayı seçtiği etkin modüllerdir.
- **Modül:** Kendi iş kapsamı, yetkileri, ekranları, iş akışları ve entegrasyon sözleşmeleri olan iş alanıdır.
- **Özellik:** Bir modülün içindeki işlevdir; ayrı bir modül olmak zorunda değildir.
- **Şablon:** Modül davranışını veri ve ayarlarla başlatan yeniden kullanılabilir tanımdır. Yeni form veya iş şablonu, yeni modül oluşturmayı gerektirmez.
- **Modül Uzantısı:** Yeni bir modülün veya özelliğin mevcut çekirdeği bozmadan kayıt olduğu menü, yetki, iş akışı, form, özet ve olay bağlantılarıdır.

## Formlar ve dış deneyimler

- **Form Şablonu:** Belirli bir iş veya portföy amacı için alanları, sürümü, hedef kapsamı ve onay akışını tanımlayan veri tanımıdır.
- **Form Gönderimi:** Bir kişi veya kurumdan gelen cevaptır; dış kaynaklı gönderimler onaylanmadan kesin iş kaydı değildir.
- **PWA / Dış Deneyim:** Firma B'nin belirlediği kapsamda müşteriye, katılımcıya, sponsora veya iş ortağına açılan dış ekranlardır; ana admin paneli değildir.

## Yetki kapsamı

Yetki; yalnızca rol adıyla değil, aşağıdaki kapsamların birleşimiyle değerlendirilir:

- Firma geneli veya departman kapsamı
- Portföy kapsamı
- İş kapsamı
- Modül kapsamı
- İşlem türü: görüntüleme, oluşturma, düzenleme, onaylama, gönderme, dışa aktarma veya yetki verme
- Hassas alan kapsamı: finans, iç not, kişisel veya gizli bilgiler

Varsayılan davranış sınırlı erişimdir. Daha geniş portföy, iş veya gönderim hakkı açıkça verilmelidir.
