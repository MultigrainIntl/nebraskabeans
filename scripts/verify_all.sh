#!/usr/bin/env bash
# Everything that must pass before anything is published. One command, no judgement calls.
#
# WHY THIS EXISTS. On 16 September 2026 I shipped a scope error into the local copy that killed
# the whole map. `node --check` passed, because the syntax was valid, and I treated that as
# verification and moved on. The functional gates WOULD have caught it -- proved afterwards by
# reintroducing the bug and watching browser-smoke and visual-contract both fail -- but I had
# not run them. GAJ: "You must ALWAYS TEST what you are building for accurate functionality.
# This is nonnegotiable."
#
# A syntax check is not a test. This script is the test. Run it before every publish, and read
# the exit code rather than the reassuring lines above it.
set -u
cd "$(dirname "$0")/.."
BASE="${NB_BASE_URL:-http://127.0.0.1:4173/}"
fail=0

run() {
  printf '  %-26s ' "$1"; shift
  if "$@" >/tmp/nbgate.log 2>&1; then echo "PASS"; else
    echo "FAIL"; sed 's/^/      /' /tmp/nbgate.log | grep -iE "assert|error|expected" | head -3
    fail=1
  fi
}

echo "functional gates (a live page is rendered and inspected)"
NB_OFFLINE_FIXTURES=1 NB_BASE_URL="$BASE" run "browser-smoke" node tests/browser-smoke.mjs
NB_BASE_URL="$BASE" run "visual-contract" node tests/visual-contract.mjs

echo "contract and truth gates"
run "foundation" node scripts/verify_foundation.mjs
run "truth-firewall" python3 tests/verify_truth_firewall.py
run "evidence-store" node --test tests/evidence-store.test.js
run "temporal-evidence" node --test tests/temporal-evidence.test.js

echo "syntax (necessary, never sufficient)"
for f in assets/decision-map.js assets/i18n.js assets/answer-first.js; do
  [ -f "$f" ] && run "$(basename "$f")" node --check "$f"
done

echo "not run here"
python3 -c "import rasterio" 2>/dev/null \
  && run "crop-footprint" python3 tests/test_crop_footprint.py \
  || echo "  crop-footprint             SKIPPED — rasterio not installed on this machine"

echo
if [ "$fail" -ne 0 ]; then
  echo "BLOCKED — something above failed. Do not publish."; exit 1
fi
echo "ALL GATES PASS — safe to publish."
