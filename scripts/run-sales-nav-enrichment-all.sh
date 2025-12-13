#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
LIMIT="${LIMIT:-3}"
SLEEP_SECONDS="${SLEEP_SECONDS:-1}"

CRON_SECRET="${CRON_SECRET:-}"
if [[ -z "${CRON_SECRET}" && -f ".env.local" ]]; then
  CRON_SECRET="$(awk -F= '/^CRON_SECRET=/{print $2}' .env.local | tail -n 1 | tr -d '\r' | sed 's/^"//;s/"$//' | sed "s/^'//;s/'$//")"
fi

echo "Base URL: ${BASE_URL}"
echo "Batch limit: ${LIMIT}"

if [[ -n "${CRON_SECRET}" ]]; then
  echo "Running cleanup (chains + duplicates)..."
  curl -sS -X POST "${BASE_URL}/api/admin/sales-navigator/cleanup" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -d '{"limit":20000,"dry_run":false}' | cat
  echo
else
  echo "CRON_SECRET not found; skipping cleanup endpoint."
  echo "Set CRON_SECRET or ensure it exists in .env.local to run cleanup."
fi

echo "Starting enrichment batches..."
total_processed=0

 while true; do
  json="$(curl -sS -X POST "${BASE_URL}/api/sales-navigator/enrichment" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"start\",\"limit\":${LIMIT},\"includeResearch\":false}")"

  if [[ "${json}" != \{* ]]; then
    echo "Non-JSON response (server error). First 300 chars:"
    echo "${json}" | head -c 300
    echo
    exit 1
  fi

  echo "${json}"

  processed="$(printf '%s' "${json}" | node -e "const fs=require('fs'); const s=fs.readFileSync(0,'utf8'); const o=JSON.parse(s); const n=o?.data?.processed ?? o?.processed ?? 0; process.stdout.write(String(n));")"
  if [[ "${processed}" == "0" ]]; then
    echo "No more pending jobs."
    break
  fi

  total_processed=$((total_processed + processed))
  echo "Processed so far: ${total_processed}"
  sleep "${SLEEP_SECONDS}"
done
