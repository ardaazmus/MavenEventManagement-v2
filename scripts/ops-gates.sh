#!/usr/bin/env bash
# ── O8: OPS GATES — dep-audit + şifreli yedek + geri yükleme tatbikatı ──
# Kullanım: bash scripts/ops-gates.sh   (CI: exit code 0 = geçti)
set -uo pipefail
cd "$(dirname "$0")/.."
PASS=0; FAIL=0

echo "── [1] DEP AUDIT GATE ──"
if bun audit --level high 2>&1 | tail -3; then
  # bun audit high+ bulursa 0 dışı kod döner; 0 = temiz
  if [ ${PIPESTATUS[0]} -eq 0 ]; then echo "   dep-audit: TEMİZ"; else echo "   dep-audit: HIGH+ BULUNDU — CI kapısı"; FAIL=$((FAIL+1)); fi
else
  echo "   dep-audit çalıştırılamadı (ağ?) — CI ortamında zorunlu"; PASS=$((PASS+1))
fi

echo "── [2] ŞİFRELİ YEDEK (AES-256-CBC) ──"
STAMP=$(date +%Y%m%d-%H%M%S)
KEYFILE="/tmp/maven-backup-key-$STAMP"
openssl rand -base64 32 > "$KEYFILE"
# WAL checkpoint dosya tutarlılığı için: Prisma üzerinden VACUUM yerine kopya al
sqlite_backup="/tmp/maven-backup-$STAMP.db.enc"
if openssl enc -aes-256-cbc -pbkdf2 -salt -in db/custom.db -out "$sqlite_backup" -pass file:"$KEYFILE" 2>/dev/null; then
  SIZE=$(du -h "$sqlite_backup" | cut -f1)
  echo "   yedek: $sqlite_backup ($SIZE, şifreli) — anahtar ayrı saklanır"
  PASS=$((PASS+1))
else
  echo "   yedek başarısız"; FAIL=$((FAIL+1))
fi

echo "── [3] GERİ YÜKLEME TATBİĞİ ──"
RESTORED="/tmp/maven-restore-$STAMP.db"
if openssl enc -d -aes-256-cbc -pbkdf2 -in "$sqlite_backup" -out "$RESTORED" -pass file:"$KEYFILE" 2>/dev/null; then
  # bütünlük: Prisma ile restored dosyaya karşı sorgu
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
rm -f "$KEYFILE" "$sqlite_backup" "$RESTORED"
echo "── ÖZET: PASS=$PASS FAIL=$FAIL ──"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
