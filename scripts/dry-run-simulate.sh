#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  source .env.local
  set +a
fi

APP_URL="${APP_BASE_URL:-http://localhost:3000}"
TARGET="${1:-respond}"
FIXTURE="${2:-repair_request_basic}"

case "$TARGET" in
  line)
    BODY="{\"fixture\":\"${FIXTURE}\"}"
    URL="${APP_URL}/api/dev/simulate/line"
    ;;
  handoff)
    BODY='{"channel":"line","profile":{"user_id":"mock-line-900","display_name":"ผู้ทดสอบ"},"message":"มีปัญหาห้องเย็นของโรงงาน อุณหภูมิไม่นิ่ง ต้องการให้เข้าดูด่วน","prior_case_state":{"extracted_fields":{"area":"ชลบุรี"}}}'
    URL="${APP_URL}/api/dev/simulate/handoff"
    ;;
  respond)
    BODY='{"channel":"line","profile":{"user_id":"mock-line-901","display_name":"ผู้ทดสอบ"},"message":"แอร์ไม่เย็น 2 เครื่อง อยู่บางพลี ขอช่างเข้าตรวจพรุ่งนี้ช่วงบ่ายครับ","prior_case_state":{"extracted_fields":{"customer_name":"สมชาย"}}}'
    URL="${APP_URL}/api/dev/simulate/respond"
    ;;
  *)
    echo "Usage: scripts/dry-run-simulate.sh [line|respond|handoff] [fixture]"
    exit 1
    ;;
esac

curl --silent --show-error --fail \
  "$URL" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo
