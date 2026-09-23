# R-a — Muhasebe'ye Mutabakat Sekmesi (work record)

Agent: full-stack-developer
Tarih: 2026-09-23
Durum: TAMAMLANDI ✓ (lint temiz, agent-browser E2E doğrulandı)

## Görev
`src/components/maven/views/accounting.tsx` (681 satır) içine 4. sekme "Mutabakat" eklemek. Yalnızca bu dosya değiştirildi; named export `AccountingView()` korundu. `GET /api/reconciliation?editionId=` sözleşmesi (R-prep'te yazılan, değiştirilmedi) tüketildi.

## Değişiklik Özeti (682 → 938 satır, +258)
- `ReconciliationData` interface'i (orders+mismatches / unverifiedPayments / expenseAudit / aging / period / readiness) dosya başına eklendi.
- Ayrı `useApi<ReconciliationData | null>` çağrısı — mevcut accounting çağrısıyla birebir aynı desen ve AYNI deps `[currentEditionId, refreshKey]`; accounting/gider veri çağrılarına dokunulmadı.
- Yardımcılar: `monthLabel()` ("2026-09" → "Eyl 2026", tr-TR), `ReconCleanState()` (yeşil EmptyState: emerald dashed border + CheckCircle2).
- TAB 4 "Mutabakat" (Icons.FileCheck) + TabsContent value="recon":
  1. Kapanış Hazırlığı kartı — ok→yeşil/CheckCircle2/"Mutabakata hazır — engelleyici bulunamadı", değil→kırmızı/AlertTriangle/"Kapanış engellendi…"; ENGELLEYICI (kırmızı, OctagonAlert) ve UYARI (amber, TriangleAlert) başlıklı listeler; action: "Oluşturuldu: fmtDateTime(generatedAt)" + Yenile butonu (loadingRecon'da disabled + spin).
  2. Sipariş Özeti: 5 Chip (Toplam/Ödendi/Açık/Kısmi/İptal).
  3. Sipariş Tutarsızlıkları (sol, lg:2): boş→yeşil "Tutarsızlık yok"; dolu→orderNo mono bold + payer + issue + Beklenen ≠ Gerçekleşen + işaretli kırmızı "Fark:" Badge.
  4. Doğrulanmamış Tahsilatlar (§38) (sağ): boş→yeşil "Tümü doğrulanmış"; dolu→orderNo + payer + tutar + PAYMENT_METHODS kaynak etiketi + paidAt + amber reason pill.
  5. Gider Denetimi: 4 KpiCard (Fiş Bekleyen / 7+ Gün Bekleyen Fiş (count>0→amber) / Onaylı — Ödenmemiş / Personeline Ödenecek), alt notlar tutar.
  6. Açık Alacak Yaşlandırması: 3 kova kartı (0-30 / 31-60 / 60+), 60+ tutarı >0→rose vurgu; altında bold "Toplam açık alacak".
  7. Son 6 Ay Dönem Özeti: kompakt tablo (sticky başlık, max-h-96 maven-scroll) — Ay/Gelir/Gider/Net (işaretli, ± renkli, normalize mini bar) + tfoot Toplam satırı.
- Tek stil dokunuşu (mobil zorunluluğu): `TabsList className="h-auto flex-wrap"` — form-center.tsx'teki 4-sekmeli view konvansiyonu; 390px'te TabsList taşmasını giderir, masaüstü görünümü değişmez.

## Doğrulama
- `bun run lint` → 0 hata / 0 uyarı (exit 0). `tsc --noEmit` → accounting.tsx'te 0 hata (diğer dosyalardaki hatalar önceden var, ilgisiz).
- agent-browser (No-Dig Turkey 2026): readiness=False → kırmızı kart + ENGELLEYICI(1) "2 tahsilat referans/teyit bilgisi eksik (§38)" + UYARI(1) "3 onaylı gider henüz ödenmedi" ✓; çipler 7/3/1/3/0 ✓; tutarsızlık yok yeşil ✓; 2 doğrulanmamış tahsilat (ORD-2026-0005 Onur Erdem ₺6.000 POS, ORD-2026-0006 Gizem Bulut ₺2.000 Ödeme Linki) ✓; Gider Denetimi 2/₺9.900, 0/₺0, 3/₺19.400, 1/₺1.250 ✓; Yaşlandırma ₺20.000 toplam (0-30: 4 sipariş) ✓; Dönem tablosu Eyl 2026 ₺38.000/₺23.000/+₺15.000 + tfoot Toplam ✓; Yenile çalışıyor ✓; diğer 3 sekme sağlam ✓; 390×844 yatay taşma 0 ✓; page errors 0, console temiz ✓; VLM görsel denetim temiz ✓.

## Bilinen Eksik / Notlar
- `tsc --noEmit` turu sırasında 4GB'lık sandbox'ta (tsc + chrome + next dev) bellek baskısı sonucu dev sunucu iki kez OOM ile düştü; sunucu yeniden başlatıldı, doğrulama tamamlandı. Bu, kodla ilgili değil ortam notudur.
- mismatch satır anahtarı `${orderNo}-${index}` (aynı siparişin birden çok tutarsızlığı olabilir).
- Delta rozeti `+` işaretini pozitif farkta ekler; negatif fmtMoney'den gelir.
- worklog.md'ye "Task ID: R-a" kaydı append edildi.
