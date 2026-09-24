#!/usr/bin/env bash
# ── O8: OPS GATES — dep-audit + tutarlı yedek + geri yükleme tatbikatı ──
# Kullanım: bash scripts/ops-gates.sh   (CI: exit code 0 = geçti)
#
# DÜZELTME 1 (fail-closed audit): eski komut `if bun audit | tail` demetiydi — if
# TAIL'in (daima 0) çıkışını görüyordu; ağ hatası/audit hatası PASS sayılıyordu.
# Artık çıkış kodu doğrudan yakalanır: 0 dışı HER sonuç (bulgu YA DA ağ hatası)
# FAIL'dir — asla PASS sayılmaz.
#
# DÜZELTME 2 (SQLite WAL tutarlılığı): ana db dosyasını dosya-kopyasıyla almak,
# WAL/SHM yan dosyaları varken TUTARSIZ kopya üretir. Yedek artık SQLite'ın
# kendi anlık-görüntü komutuyla (VACUUM INTO — WAL içeriği dahili tutarlı kopya)
# alınır; ardından integrity_check + şifreli saklama + geri yükleme + okuma
# doğrulaması güvenli /tmp konumunda yapılır.
#
# KAPSAM NOTU: bu yerel bir tatbiktır — PROD yedek kapsamı/genelgeçerliliği iddia
# ETMEZ; prod yedekleme ayrı altyapı gerektirir.
set -uo pipefail
cd "$(dirname "$0")/.."
PASS=0; FAIL=0

echo "── [1] DEP AUDIT GATE ──"
audit_out=$(bun audit --level high 2>&1)
audit_code=$?
if [ $audit_code -eq 0 ]; then
  echo "   dep-audit: TEMİZ"
  PASS=$((PASS+1))
else
  echo "$audit_out" | tail -3
  echo "   dep-audit: BULGU VEYA ÇALIŞTIRILAMADI (çıkış $audit_code) — CI kapısı; PASS SAYILMAZ"
  FAIL=$((FAIL+1))
fi

echo "── [2] TUTARLI YEDEK (VACUUM INTO + AES-256-CBC) ──"
STAMP=$(date +%Y%m%d-%H%M%S)
KEYFILE="/tmp/maven-backup-key-$STAMP"
openssl rand -base64 32 > "$KEYFILE"
SNAPSHOT="/tmp/maven-snapshot-$STAMP.db"
sqlite_backup="/tmp/maven-backup-$STAMP.db.enc"
snap_err=$(bun -e "
import { Database } from 'bun:sqlite';
const src = new Database('db/custom.db', { readonly: true });
src.exec(\"VACUUM INTO '$SNAPSHOT'\");
src.close();
console.log('ok');
" 2>&1)
if [[ "$snap_err" == *"ok"* ]]; then
  # Anlık görüntü bütünlüğü: kopya üzerinde integrity_check
  integ=$(bun -e "
import { Database } from 'bun:sqlite';
const db = new Database('$SNAPSHOT', { readonly: true });
const r = db.query('PRAGMA integrity_check').get();
console.log(r && r.integrity_check ? r.integrity_check : 'BILINMEYEN');
db.close();
" 2>&1)
  if [[ "$integ" == "ok" ]]; then
    if openssl enc -aes-256-cbc -pbkdf2 -salt -in "$SNAPSHOT" -out "$sqlite_backup" -pass file:"$KEYFILE" 2>/dev/null; then
      SIZE=$(du -h "$sqlite_backup" | cut -f1)
      echo "   yedek: $sqlite_backup ($SIZE, şifreli; VACUUM INTO tutarlı anlık görüntü + integrity_check=ok) — anahtar ayrı saklanır"
      PASS=$((PASS+1))
    else
      echo "   şifreleme başarısız"; FAIL=$((FAIL+1))
    fi
  else
    echo "   integrity_check başarısız: $integ"; FAIL=$((FAIL+1))
  fi
else
  echo "   VACUUM INTO başarısız: $snap_err"; FAIL=$((FAIL+1))
fi

echo "── [3] GERİ YÜKLEME TATBİĞİ ──"
RESTORED="/tmp/maven-restore-$STAMP.db"
if openssl enc -d -aes-256-cbc -pbkdf2 -in "$sqlite_backup" -out "$RESTORED" -pass file:"$KEYFILE" 2>/dev/null; then
  # bütünlük: Prisma ile restored dosyaya karşı sorgu (okuma doğrulaması)
  RESULT=$(DATABASE_URL="file:$RESTORED" bun -e "
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const t = await db.tenant.count();
const e = await db.eventEdition.count();
console.log('tenant:' + t + ', editions:' + e);
await db.\$disconnect();" 2>/dev/null)
  if [[ "$RESULT" == *"tenant:"* ]]; then
    echo "   geri yükleme DOĞRULANDI: $RESULT"; PASS=$((PASS+1))
  else
    echo "   geri yüklenen dosya sorgulanamadı"; FAIL=$((FAIL+1))
  fi
else
  echo "   çözme başarısız"; FAIL=$((FAIL+1))
fi
rm -f "$KEYFILE" "$SNAPSHOT" "$sqlite_backup" "$RESTORED"
echo "── [4] i18n TIRMIK KAPISI (TASK-B 29) ──"
if node scripts/i18n-hardcoded-scan.mjs; then
  PASS=$((PASS+1))
else
  echo "   sert-kodlu TR arttı — sözlük-öncelik kuralı ihlal edildi"; FAIL=$((FAIL+1))
fi
echo "── ÖZET: PASS=$PASS FAIL=$FAIL ──"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
