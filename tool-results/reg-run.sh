#!/usr/bin/env bash
# REG-IO-2 regresyon koşumu — ana suite'ler SIRALI, suite-başına taze dev server
# (4GB sandbox OOM disiplini; SQLite tek-yazıcı — paralel YOK).
set -u
cd /home/z/my-project
OUT="/home/z/my-project/tool-results/regression-accommodation.log"
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
  echo "[restart] FAILED" >> "$OUT"; return 1
}

SUITES=(tests/ui-corrections.spec.ts tests/corrections.spec.ts tests/flow.spec.ts tests/phase4-boundaries.spec.ts tests/phase0-chain-writes.spec.ts tests/phase2-money.spec.ts tests/phase3-workflow.spec.ts tests/goldens.spec.ts tests/modules/18-registrations-manual-io.spec.ts)

TOTAL=0; FAILED=()
for s in "${SUITES[@]}"; do
  echo "=== SUITE $s — $(date +%H:%M:%S) ===" >> "$OUT"
  restart_server || { FAILED+=("$s:server"); continue; }
  curl -s -o /dev/null -X POST http://localhost:3000/api/seed
  bun run scripts/portal-demo-setup.mjs >> "$OUT" 2>&1 || true
  npx playwright test "$s" --project=chromium >> "$OUT" 2>&1
  st=$?
  if [ $st -eq 0 ]; then echo ">>> $s OK" >> "$OUT"; else echo ">>> $s FAIL (exit $st)" >> "$OUT"; FAILED+=("$s"); fi
done

echo "===== SUMMARY =====" >> "$OUT"
if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL_SUITES_GREEN" >> "$OUT"; else echo "FAILED: ${FAILED[*]}" >> "$OUT"; fi
tail -25 "$OUT"
