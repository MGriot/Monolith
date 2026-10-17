#!/usr/bin/env bash
# One-time (idempotent) preparation of the internal mail server, run BEFORE the first `up`:
#   - generates a self-signed TLS certificate (docker-mailserver does not create one itself)
#   - creates the sender mailbox ($SMTP_USER) so Dovecot can start (it shuts the container down
#     after 120s if no account exists)
# Uses the compose service definition, so it works the same with podman-compose and docker compose
# and needs no openssl on the host. Usage:  scripts/mail-bootstrap.sh [compose args, e.g. --env-file x.env]
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=${COMPOSE:-podman-compose}
ENV_FILE=${ENV_FILE:-.env}
[ -f "$ENV_FILE" ] || { echo "missing $ENV_FILE (copy .env.example first)" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a
: "${MAIL_DOMAIN:?MAIL_DOMAIN not set}" "${SMTP_USER:?SMTP_USER not set}" "${SMTP_PASSWORD:?SMTP_PASSWORD not set}"

mkdir -p "${MAIL_CONFIG_DIR:-mailserver/config}"

MSYS_NO_PATHCONV=1 "$COMPOSE" --env-file "$ENV_FILE" -f compose.yaml run --rm --no-deps \
  -e "MAIL_DOMAIN=$MAIL_DOMAIN" -e "SMTP_USER=$SMTP_USER" -e "SMTP_PASSWORD=$SMTP_PASSWORD" \
  --entrypoint sh mailserver -c '
set -eu
mkdir -p /tmp/docker-mailserver/ssl
if [ ! -f /tmp/docker-mailserver/ssl/mail.key ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout /tmp/docker-mailserver/ssl/mail.key -out /tmp/docker-mailserver/ssl/mail.crt \
    -subj "/CN=mail.${MAIL_DOMAIN}" \
    -addext "subjectAltName=DNS:mail.${MAIL_DOMAIN},DNS:mailserver,DNS:localhost" 2>/dev/null
  chmod 600 /tmp/docker-mailserver/ssl/mail.key
  echo "generated self-signed certificate"
fi
if grep -q "^${SMTP_USER}|" /tmp/docker-mailserver/postfix-accounts.cf 2>/dev/null; then
  # keep the mailbox password in sync with SMTP_PASSWORD (a rotated password used to leave the app unable to log in: 535)
  setup email update "${SMTP_USER}" "${SMTP_PASSWORD}"
  echo "mailbox ${SMTP_USER} exists; password synced with SMTP_PASSWORD"
else
  setup email add "${SMTP_USER}" "${SMTP_PASSWORD}"
  echo "created mailbox ${SMTP_USER}"
fi'
echo "Mail server prepared. Now: $COMPOSE --env-file $ENV_FILE -f compose.yaml up -d"
