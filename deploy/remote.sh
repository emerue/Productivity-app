#!/usr/bin/env bash
# Runs ON THE VPS as root, sent over SSH by deploy/deploy.sh. Idempotent.
# It only touches /srv/frog, the "frog" user and the frog systemd unit,
# plus (for the "https" action) one Nginx site named "frog".
#
#   release <stamp>          install /tmp/frog-<stamp>.tgz and switch to it
#   password '<bcrypt hash>' set PASSWORD_HASH in /srv/frog/.env
#   rollback                 switch back to the previous release
#   status                   service state and health
#   https <domain> <email>   Let's Encrypt certificate + Nginx site
set -euo pipefail

BASE=/srv/frog
APP=$BASE/app
RELEASES=$BASE/releases
DATA=$BASE/data
ENV_FILE=$BASE/.env
KEEP=5

say() { printf '\n==> %s\n' "$*"; }
die() {
  printf '\nError: %s\n' "$*" >&2
  exit 1
}
port() { grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d "'\"" || true; }

# --- Base: user, folders, Node, env file ------------------------------------

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)'
}

ensure_base() {
  if ! id frog >/dev/null 2>&1; then
    say "Creating system user 'frog'"
    useradd --system --home-dir "$BASE" --no-create-home --shell /usr/sbin/nologin frog
  fi
  mkdir -p "$RELEASES" "$DATA"
  chown frog:frog "$DATA"
  chmod 700 "$DATA"

  if ! node_ok; then
    say "Installing Node.js 22 LTS (NodeSource)"
    command -v curl >/dev/null || apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  node_ok || die "Node.js 20.19+ is required; found $(node -v 2>/dev/null || echo none)."

  if [ ! -f "$ENV_FILE" ]; then
    say "Creating $ENV_FILE (session secret generated, password not set yet)"
    # Subshell: a bare umask 077 would leak into the release steps and leave
    # the release unreadable by the frog user (systemd CHDIR failure).
    (
      umask 077
      cat >"$ENV_FILE" <<EOF
PORT=3080
DATA_DIR=$DATA
TZ=Africa/Lagos
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
PASSWORD_HASH=
EOF
    )
  fi
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

password_set() { grep -Eq "^PASSWORD_HASH=.+" "$ENV_FILE"; }

# --- Health, switching, pruning ---------------------------------------------

health() {
  local p
  p=$(port)
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${p:-3080}/api/health" 2>/dev/null; then
      echo
      return 0
    fi
    sleep 1
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$APP.next"
  mv -T "$APP.next" "$APP"
}

current() { readlink -f "$APP" 2>/dev/null || true; }

previous() {
  local cur
  cur=$(current)
  ls -1d "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | sort -r | while read -r d; do
    [ "$(readlink -f "$d")" != "$cur" ] && echo "$d" && break
  done
}

prune() {
  local cur
  cur=$(current)
  ls -1d "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | sort -r | tail -n +$((KEEP + 1)) | while read -r d; do
    [ "$(readlink -f "$d")" = "$cur" ] || rm -rf "$d"
  done
}

restart_and_check() {
  systemctl restart frog
  if health; then
    return 0
  fi
  echo "Health check failed. Last log lines:" >&2
  journalctl -u frog -n 40 --no-pager >&2 || true
  return 1
}

# --- Actions ----------------------------------------------------------------

release() {
  local stamp=${1:?release needs a stamp}
  local tarball=/tmp/frog-$stamp.tgz
  local dir=$RELEASES/$stamp
  [ -f "$tarball" ] || die "$tarball not found (upload failed?)"

  ensure_base

  say "Unpacking release $stamp"
  rm -rf "$dir"
  mkdir -p "$dir"
  tar -xzf "$tarball" -C "$dir" --no-same-owner
  rm -f "$tarball"

  say "Installing runtime dependencies (no build on this server)"
  (cd "$dir" && npm ci --omit=dev -w server --no-audit --no-fund --loglevel=error)
  # frog must be able to read the code; only root may change it.
  chown -R root:root "$dir"
  chmod -R u+rwX,go+rX,go-w "$dir"

  if ! cmp -s "$dir/deploy/frog.service" /etc/systemd/system/frog.service; then
    say "Installing systemd unit"
    install -m 644 "$dir/deploy/frog.service" /etc/systemd/system/frog.service
    systemctl daemon-reload
  fi
  systemctl enable frog >/dev/null 2>&1

  local prev
  prev=$(current)
  switch_to "$dir"

  if ! password_set; then
    say "Release installed, but no password is set yet."
    echo "Run from your laptop:  deploy/deploy.sh password"
    exit 0
  fi

  say "Restarting frog"
  if restart_and_check; then
    prune
    say "Live: $stamp"
  else
    if [ -n "$prev" ] && [ -d "$prev" ]; then
      say "Rolling back to $(basename "$prev")"
      switch_to "$prev"
      systemctl restart frog
      health >/dev/null && echo "Previous release is running again."
    fi
    die "Release $stamp failed its health check."
  fi
}

set_password() {
  local hash=${1:-}
  [[ $hash =~ ^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$ ]] || die "That is not a bcrypt hash."
  ensure_base
  local tmp
  tmp=$(mktemp)
  grep -v '^PASSWORD_HASH=' "$ENV_FILE" >"$tmp" || true
  printf "PASSWORD_HASH='%s'\n" "$hash" >>"$tmp"
  install -m 600 -o root -g root "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  say "Password updated"
  if [ -e "$APP" ]; then
    restart_and_check && say "frog is running"
  fi
}

rollback() {
  local prev
  prev=$(previous)
  [ -n "$prev" ] || die "No previous release to roll back to."
  say "Switching to $(basename "$prev")"
  switch_to "$prev"
  restart_and_check
}

status() {
  systemctl --no-pager --lines=5 status frog || true
  say "Current release: $(basename "$(current)" 2>/dev/null || echo none)"
  health || echo "Not responding on 127.0.0.1:$(port)"
}

https() {
  local domain=${1:?https needs a domain} email=${2:-}
  # No email: Let's Encrypt sends no expiry notices (renewal is automatic anyway).
  local contact=(--register-unsafely-without-email)
  [ -n "$email" ] && contact=(-m "$email")
  [ -f "$APP/deploy/nginx.conf.template" ] || die "Deploy a release first."
  command -v nginx >/dev/null || die "Nginx is not installed."

  if ! command -v certbot >/dev/null || ! dpkg -s python3-certbot-nginx >/dev/null 2>&1; then
    say "Installing certbot"
    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx
  fi

  say "Requesting a certificate for $domain"
  certbot certonly --nginx -d "$domain" --non-interactive --agree-tos "${contact[@]}" --keep-until-expiring

  say "Installing the Nginx site"
  sed "s/\${DOMAIN}/$domain/g" "$APP/deploy/nginx.conf.template" >/etc/nginx/sites-available/frog
  ln -sfn /etc/nginx/sites-available/frog /etc/nginx/sites-enabled/frog
  if ! nginx -t; then
    rm -f /etc/nginx/sites-enabled/frog
    die "Nginx config test failed; the Frog site was disabled again. Other sites are untouched."
  fi
  systemctl reload nginx

  say "Checking certificate renewal"
  certbot renew --dry-run --cert-name "$domain"

  say "Done: https://$domain"
  curl -fsS "https://$domain/api/health" && echo || echo "(Not reachable yet; DNS may still be propagating.)"
}

case "${1:-}" in
  release) release "${2:-}" ;;
  password) set_password "${2:-}" ;;
  rollback) rollback ;;
  status) status ;;
  https) https "${2:-}" "${3:-}" ;;
  *) die "Unknown action '${1:-}'. Use release, password, rollback, status or https." ;;
esac
