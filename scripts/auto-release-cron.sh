#!/bin/bash
SECRET=$(grep "^CRON_SECRET=" /root/paa-ai-brain/.env.local | cut -d"\"" -f2)
RESULT=$(curl -s -X POST -H "x-cron-secret: $SECRET" http://localhost:3011/api/admin/auto-release-stale)
echo "[$(date -Iseconds)] $RESULT"
