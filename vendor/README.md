# vendor/ — yerel bağımlılık aynası

## xlsx-0.20.3.tgz

- **Kaynak:** https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz (resmi SheetJS derlemesi)
- **Alınma:** 2026-09-30
- **Boyut:** 2.409.319 bayt
- **sha256:** `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- **sha512:** `oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==` (bun.lock kaydıyla birebir doğrulandı)

**Neden:** npm kayıt defterinde düzeltilmiş 0.20.x sürümü yok (yalnız CVE'li 0.18.5); düzeltme yalnız resmi
SheetJS CDN derlemesinde. CDN tek-nokta bağımlılığını kaldırmak için tarball depoya alındı ve
`package.json` içinde `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` olarak bağlandı (F0-c′).

**Güncelleme prosedürü:** yeni sürüm alınırken tarball + buradaki hash'ler + `bun.lock` birlikte güncellenir;
CI `bun install --frozen-lockfile` ile yerel dosyadan kurar (ağ bağımlılığı yok).
