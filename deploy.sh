#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/paa-ai-brain}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-ai-brain}"
DEPLOY_SSH_OPTS="${DEPLOY_SSH_OPTS:-}"
DEPLOY_RELEASE="${DEPLOY_RELEASE:-$(date +%Y%m%d-%H%M%S)}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-}"
DEPLOY_ARCHIVE_DIR="${DEPLOY_ARCHIVE_DIR:-${ROOT_DIR}/.deploy/releases}"
AUTO_RELEASE_CRON_ENABLED="${AUTO_RELEASE_CRON_ENABLED:-true}"
AUTO_RELEASE_CRON_SCHEDULE="${AUTO_RELEASE_CRON_SCHEDULE:-*/5 * * * *}"
AUTO_RELEASE_CRON_LOG="${AUTO_RELEASE_CRON_LOG:-/var/log/paa-auto-release.log}"

if [[ -z "$DEPLOY_HOST" ]]; then
  echo "DEPLOY_HOST is required"
  echo "Example:"
  echo "  DEPLOY_HOST=1.2.3.4 ./deploy.sh"
  exit 1
fi

if [[ -z "$DEPLOY_BRANCH" ]]; then
  if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    DEPLOY_BRANCH="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi

  DEPLOY_BRANCH="${DEPLOY_BRANCH:-local}"
fi

DEPLOY_COMMIT="unknown"
if git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  DEPLOY_COMMIT="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
fi

ARCHIVE_BASENAME="${DEPLOY_BRANCH}-${DEPLOY_RELEASE}.tar.gz"
ARCHIVE_PATH="${DEPLOY_ARCHIVE_DIR}/${ARCHIVE_BASENAME}"

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

RSYNC_RSH="ssh -p ${DEPLOY_PORT}"
if [[ -n "$DEPLOY_SSH_OPTS" ]]; then
  RSYNC_RSH+=" ${DEPLOY_SSH_OPTS}"
fi

mkdir -p "${DEPLOY_ARCHIVE_DIR}"

echo "==> Creating release archive ${ARCHIVE_PATH}"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env.local' \
  --exclude='.deploy' \
  --exclude='project.tar.gz' \
  -czf "${ARCHIVE_PATH}" \
  -C "${ROOT_DIR}" .

echo "==> Syncing project to ${SSH_TARGET}:${DEPLOY_PATH}"
rsync -avz --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env.local' \
  --exclude '.deploy' \
  --exclude 'project.tar.gz' \
  -e "${RSYNC_RSH}" \
  "${ROOT_DIR}/" "${SSH_TARGET}:${DEPLOY_PATH}/"

echo "==> Uploading release archive to VPS"
ssh -p "${DEPLOY_PORT}" ${DEPLOY_SSH_OPTS} "${SSH_TARGET}" \
  "mkdir -p '${DEPLOY_PATH}/releases'"

rsync -avz \
  -e "${RSYNC_RSH}" \
  "${ARCHIVE_PATH}" "${SSH_TARGET}:${DEPLOY_PATH}/releases/${ARCHIVE_BASENAME}"

echo "==> Writing release metadata on VPS"
ssh -p "${DEPLOY_PORT}" ${DEPLOY_SSH_OPTS} "${SSH_TARGET}" \
  "cat > '${DEPLOY_PATH}/release.json' <<'EOF'
{
  \"release\": \"${DEPLOY_RELEASE}\",
  \"branch\": \"${DEPLOY_BRANCH}\",
  \"commit\": \"${DEPLOY_COMMIT}\",
  \"archive\": \"releases/${ARCHIVE_BASENAME}\",
  \"deployed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
}
EOF"

echo "==> Running docker compose build on VPS"
ssh -p "${DEPLOY_PORT}" ${DEPLOY_SSH_OPTS} "${SSH_TARGET}" \
  "cd '${DEPLOY_PATH}' && docker-compose up -d --build"

if [[ "${AUTO_RELEASE_CRON_ENABLED}" == "true" ]]; then
  echo "==> Installing auto-release cron on VPS"
  ssh -p "${DEPLOY_PORT}" ${DEPLOY_SSH_OPTS} "${SSH_TARGET}" "bash -s" <<EOF
set -euo pipefail

DEPLOY_PATH='${DEPLOY_PATH}'
AUTO_RELEASE_CRON_SCHEDULE='${AUTO_RELEASE_CRON_SCHEDULE}'
AUTO_RELEASE_CRON_LOG='${AUTO_RELEASE_CRON_LOG}'
CRON_MARKER='# PAA auto-release cron'
CRON_COMMAND="\${AUTO_RELEASE_CRON_SCHEDULE} \${DEPLOY_PATH}/scripts/auto-release-cron.sh >> \${AUTO_RELEASE_CRON_LOG} 2>&1"

chmod +x "\${DEPLOY_PATH}/scripts/auto-release-cron.sh"
touch "\${AUTO_RELEASE_CRON_LOG}"

TMP_CRON=\$(mktemp)
{
  crontab -l 2>/dev/null | grep -Fv "\${DEPLOY_PATH}/scripts/auto-release-cron.sh" | grep -Fv "\${CRON_MARKER}" || true
  echo "\${CRON_MARKER}"
  echo "\${CRON_COMMAND}"
} > "\${TMP_CRON}"

crontab "\${TMP_CRON}"
rm -f "\${TMP_CRON}"
EOF
else
  echo "==> AUTO_RELEASE_CRON_ENABLED=false, skipping cron install"
fi

echo "==> Showing service status"
ssh -p "${DEPLOY_PORT}" ${DEPLOY_SSH_OPTS} "${SSH_TARGET}" \
  "cd '${DEPLOY_PATH}' && docker-compose ps && docker-compose logs --tail=80 '${DEPLOY_SERVICE}'"

echo "==> Deploy completed"
echo "Release: ${DEPLOY_RELEASE}"
echo "Branch: ${DEPLOY_BRANCH}"
echo "Commit: ${DEPLOY_COMMIT}"
echo "Archive: ${ARCHIVE_PATH}"
echo "Auto-release cron enabled: ${AUTO_RELEASE_CRON_ENABLED}"
if [[ "${AUTO_RELEASE_CRON_ENABLED}" == "true" ]]; then
  echo "Auto-release cron schedule: ${AUTO_RELEASE_CRON_SCHEDULE}"
  echo "Auto-release cron log: ${AUTO_RELEASE_CRON_LOG}"
fi
