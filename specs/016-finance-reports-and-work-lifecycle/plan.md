# Uygulama Planı: 016 — Finans, Raporlar ve İş Yaşam Döngüsü (Faz 11)

## 1. Mimari Tasarım ve Değişiklik Özeti

Bu plan, Faz 11'in 4 ana temelini modüler ve geriye dönük uyumlu biçimde hayata geçirir:

1. **`src/lib/product-taxonomy.ts`:**
   - 5 Aşamalı Makro Yaşam Döngüsü tanımları:
     `MACRO_LIFECYCLE_STAGES = ["DRAFT", "PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"]`
   - Ayrıntılı iş durumlarını makro aşamalara eşleyen `getMacroLifecycleStage(status: string)` yardımcısı.
   - Tüm iş türleri (`CONFERENCE`, `EXPO`, `CORPORATE`, `SOCIAL`, `TRAVEL`, `SPORTS`) için yaşam döngüsü şablon desteği.

2. **`src/components/maven/views/company-reports-view.tsx`:**
   - Yeni bileşen: Firma Raporları Panosu (Company Reports View).
   - Global `reports` alanı seçildiğinde açılır.
   - Sekmeler:
     - `portfolio-report`: Portföy Büyüme & Kişi/Kurum Analizi.
     - `works-report`: İş Portföyü Karşılaştırması (çapraz işler, bütçe vs gerçekleşen, katılımcı metrikleri, "İşi Aç" ve "Finansı Aç" eylemleri).
     - `operations-report`: Operasyonel Görev Metrikleri (tamamlanma yüzdesi, SLA, öncelik).
     - `finance-report`: Konsolide Firma Finansı (toplam ciro, tahsilat, açık bakiye, kârlılık).
     - `comms-report`: Genel İletişim & Kampanya Başarısı (ulaşma oranı, etkileşim).
     - `exports-report`: Dışa Aktarımlar Arşivi (merkezi indirme ve loglar).
   - Rapordan kaynak işe doğrudan geçiş mekanizması (`setCurrentEdition(id)` + ilgili modülü açma).

3. **`src/components/maven/views/finance.tsx` & `src/components/maven/views/accounting.tsx`:**
   - `FinanceView`:
     - Operasyonel finans odaklı banner ve yapı (`Siparişler`, `Tahsilatlar & Ödemeler`, `İadeler`, `Ek Hizmet Kataloğu`).
     - "Mali Defter & Mutabakat Görünümüne Git" geçiş butonu (`setModule("accounting")`).
     - SoD (>50.000 TL) çift onay denetim göstergesi.
   - `AccountingView`:
     - Defter, gelirler, giderler, bütçe kırılımı ve mutabakat odaklı yapı.
     - "Operasyonel Finans & Siparişlere Dön" butonu (`setModule("finance")`).
     - "İş Özetine Dön" butonu (`setModule("dashboard")`).
     - İş Kapanış Mutabakatı belgesi ve mutabakat tamamlandığında `ARCHIVED` aşamasına geçiş.

4. **`src/components/maven/navigation/dual-sidebar.tsx` & `src/lib/module-components.tsx`:**
   - `dual-sidebar.tsx`:
     - Global `reports` alanı tıklandığında `setModule("company-reports")` tetiklenmesi.
     - `reports` ikincil menü sekmeleri için alt görünüm (`moduleSubView`) eşlemesi ve aktiflik vurgusu.
     - İş menüsündeki `work_reports` grubu (`work-finance-reports`, `work-reg-reports`, `work-sponsor-reports`) için doğru `primaryModuleId`, `moduleSubView` ve aktiflik kontrolü.
   - `module-components.tsx`:
     - `company-reports` modül kimliği için `CompanyReportsView` dinamik bileşen kaydı.

5. **`src/components/maven/views/jobs-view.tsx` & `src/components/maven/views/work-summary-view.tsx`:**
   - `jobs-view.tsx`:
     - Makro yaşam döngüsü filtreleri (`DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`).
     - İş kartlarında ve liste görünümünde makro durum rozetleri.
   - `work-summary-view.tsx`:
     - Yaşam döngüsü ilerleme göstergesi ve aşama geçişi.

6. **i18n ve Test:**
   - TR ve EN sözlük dosyalarına tüm yeni terimlerin eklenmesi.
   - `tests-mini/finance-reports-and-work-lifecycle.test.mjs` karakterizasyon testinin yazılması ve `package.json`'a eklenmesi.
   - Kalite kapılarının (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality`) yürütülmesi.

---

## 2. Risk Analizi ve Önlemler

- **React 19 Lint Kuralı (`react-hooks/set-state-in-effect`):** `useEffect` gövdesinde eşzamanlı `setState` çağrılmamalı; `setTimeout(..., 0)` ile sarılmalı.
- **E2E Erişilebilirlik & Test Kararlılığı:** Menü butonlarında regex eşleşen görünen isimler korunmalı; erişilebilir etiketler bozulmamalıdır.
- **Port Disiplini:** Sunucu port 3005 üzerinde aktif çalışmaktadır; port 3000 veya 3001'e dokunulmayacaktır.
- **Sıfır Hardcoded Metin:** Tüm metinler `tr.json`, `en.json` ve ilgili `_new` sözlüklerinde tanımlanacaktır.
