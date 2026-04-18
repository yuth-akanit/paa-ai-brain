#!/usr/bin/env bash
set -euo pipefail

echo "Blocked: scripts/test-line-webhook.sh targets the live LINE webhook route."
echo "Current local testing policy is mock-only / dry-run only."
echo "Use scripts/dry-run-simulate.sh line or /api/dev/simulate/line instead."
exit 1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env.local
set +a

APP_URL="${APP_BASE_URL:-http://localhost:3000}"

REQUEST_BODY='{"destination":"test-destination","events":[{"type":"message","source":{"type":"user","userId":"line-e2e-user-001"},"message":{"id":"line-message-e2e-001","type":"text","text":"แอร์ไม่เย็น อยู่บางนา ขอช่างเข้าตรวจพรุ่งนี้ช่วงบ่ายครับ"},"timestamp":1760000000000}]}'

SIGNATURE="$(printf '%s' "$REQUEST_BODY" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64)"

curl --silent --show-error --fail \
  "${APP_URL}/api/webhooks/line" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-line-signature: ${SIGNATURE}" \
  -d "$REQUEST_BODY"

echo
echo "LINE webhook test completed."
