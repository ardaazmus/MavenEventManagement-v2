#!/usr/bin/env bash
# ── F6: E2E golden flow harness (agent-browser tabanlı — Playwright DEP İZNİ YOK) ──
# Akış: kayıt (public form) → ödeme (payments/process) → yaka kartı (print-queue) → tarama (scan)
# Kullanım: bash scripts/e2e-golden-flow.sh
set -euo pipefail
BASE="http://localhost:3000"
echo "① Uçlar canlı mı?"
for p in /api/bootstrap /api/scan; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$p" || true)
  echo "   $p → $code"
done
echo "② Kayıt (public-register golden form):"
FORM=$(curl -s "$BASE/api/forms?tenantId=$(curl -s $BASE/api/bootstrap | grep -o '"tenantId":"[^"]*"' | head -1 | cut -d'"' -f4)&status=PUBLISHED&limit=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
echo "   yayındaki form: ${FORM:-yok} — agent-browser ile form doldurma:"
echo "   agent-browser open $BASE && agent-browser find text \"Form Merkezi\" click"
echo "③ Ödeme: POST /api/payments/<id>/process { cardHolder, cardNumber: '4111111111111111', expiry: '12/28', cvc: '123' }"
echo "④ Yaka kartı: GET /api/badges/print-queue?editionId=<id> → POST PRINT|ISSUE"
echo "⑤ Tarama: POST /api/scan { code: <credentialCode> } → ALLOWED | tekrar → RESCAN_WARNING"
echo "Not: adım 3-5'in canlı yürütmesi agent-browser oturumu ister (bkz. worklog OMNI-G0/G1 kanıtları)."
