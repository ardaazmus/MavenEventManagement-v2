#!/usr/bin/env bash
# CRON-E2E koşum döngüsü — modül spec'leri SIRALI, suite-başına taze dev server.
# Kullanım: bash tests/modules/run-loop.sh [iteration-tag]
set -u
cd /home/z/my-project
TAG="${1:-run}"
OUT="/tmp/e2e-modules-${TAG}.log"
: > "$OUT"

restart_server() {
  pkill -f "next dev" 2>/dev/null || true
  pkill -f next-server 2>/dev/null || true
  sleep 3
  rm -f /home/z/my-project/.next/dev/lock
  ( setsid nohup bun run dev </dev/null >> dev.log 2>&1 & )
  for i in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || true)
    if [ "$code" = "200" ]; then echo "[restart] health 200 (${i}s)" >> "$OUT"; return 0; fi
    sleep 1
  done
  echo "[restart] FAILED — health never 200" >> "$OUT"; return 1
}

SPECS=(01-auth-login 02-dashboard 03-bottom-nav 04-program-ics 05-program-capacity-409 06-sponsors 07-floor-plan 08-profile 09-forms 10-gamification 11-qa 12-announcements 13-notification-center 14-channels-admin 15-admin-cards 16-pwa-offline 17-i18n 19-accommodation-manual)

TOTAL_PASS=0; TOTAL_FAIL=0; FAILED_SUITES=()
for s in "${SPECS[@]}"; do
  echo "=== SUITE $s — $(date +%H:%M:%S) ===" >> "$OUT"
  restart_server || { FAILED_SUITES+=("$s:server"); continue; }
  # suite öncesi demo taban çizgisi (portal config + duyuru + B2B demo) garanti
  curl -s -o /dev/null -X POST http://localhost:3000/api/seed
  bun run scripts/portal-demo-setup.mjs >> "$OUT" 2>&1 || echo "[seed] portal-demo-setup uyarı" >> "$OUT"
  npx playwright test "tests/modules/${s}.spec.ts" --project=chromium >> "$OUT" 2>&1
  st=$?
  pass=$(grep -c "passed" "$OUT" || true)
  if [ $st -eq 0 ]; then
    echo ">>> $s OK" >> "$OUT"
  else
    echo ">>> $s FAIL (exit $st)" >> "$OUT"
    FAILED_SUITES+=("$s")
  fi
  sleep 3
done

echo "=== ÖZET ===" >> "$OUT"
if [ ${#FAILED_SUITES[@]} -eq 0 ]; then echo "ALL 17 SUITES GREEN" >> "$OUT"; else printf 'FAILED: %s\n' "${FAILED_SUITES[@]}" >> "$OUT"; fi
echo "done $(date +%H:%M:%S)" >> "$OUT"
