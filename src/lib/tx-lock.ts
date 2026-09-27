// ── Tek-örnek yazım serileştirme (SQLite) ───────────────────────────────────────
// SQLite/WAL'da DEFERRED transaction'ın okuma-sonrası-yazım yükseltmesi, başka bir
// tx aynı arada COMMIT aldıysa SQLITE_BUSY_SNAPSHOT ile düşer — busy_timeout bu
// durumda YARDIM ETMEZ. Finansal satırlar (sipariş bakiyesi) üzerindeki eşzamanlı
// işlem çakışmasını kök-nedeninde çözmek için anahtar-başına sürec-içi sıra (mutex)
// kullanılır: aynı siparişe gelen iadeler SERİ işlenir; unique kısıt
// (@@unique([orderId, idempotencyKey])) ise yine de INVARIANT güvencesi olarak kalır.
//
// TAVAN (belgelenmiş): bu kilit süreç-içidir — tek-örnek kurulumda doğrudur (bu
// dağıtım öyledir; bkz. rate-limit.ts başındaki tek-örnek notu). Çoklu-örnek
// kurulumda kilit + rate kovaları birlikte paylaşılan depoya taşınmalıdır.
const locks = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  // önceki işlemin sonucundan bağımsız sıraya gir (hata zinciri yayılmasın)
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined).then(() => {
    // sıranın sonu kendisiyse anahtarı temizle (bellek sızıntısı yok); araya yeni
    // bir işlem girdiyse dokunma — onun kendi temizliği çalışır
    if (locks.get(key) === tail) locks.delete(key);
  });
  locks.set(key, tail);
  return run;
}
