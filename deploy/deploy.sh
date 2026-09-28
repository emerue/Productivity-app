#!/usr/bin/env bash
# Deploys Frog from THIS machine. Build and tests run here; the VPS only
# receives the finished app and installs runtime dependencies.
#
#   deploy/deploy.sh                   build, test, upload, switch, health check
#   deploy/deploy.sh password          set or change the sign-in password
#   deploy/deploy.sh rollback          switch back to the previous release
#   deploy/deploy.sh status            service state and /api/health
#   deploy/deploy.sh tunnel            open the app at http://localhost:3080 via SSH
#   deploy/deploy.sh https DOMAIN EMAIL  certificate + Nginx site for DOMAIN
#   deploy/deploy.sh backup            copy daily backups to ./backups/ on this machine
#
# Needs: bash (Git Bash on Windows), node, npm, tar, ssh, scp.
# Target server: FROG_HOST in deploy/deploy.env (not committed), e.g.
#   FROG_HOST=root@203.0.113.10
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)

if [ -f deploy/deploy.env ]; then
  # shellcheck disable=SC1091
  . deploy/deploy.env
fi
: "${FROG_HOST:?Set FROG_HOST=user@server in deploy/deploy.env (see deploy/DEPLOY.md)}"

say() { printf '\n==> %s\n' "$*"; }
remote() { ssh "$FROG_HOST" "bash -s -- $*" <deploy/remote.sh; }

build_and_test() {
  say "Building (shared, server, client)"
  npm run build
  say "Typechecking"
  npm run typecheck
  say "Running tests"
  npm test
}

package() {
  local stamp=$1 out=$2
  printf '%s\n' "$stamp" >release.txt
  tar -czf "$out" \
    package.json package-lock.json release.txt \
    shared/package.json shared/dist \
    server/package.json server/dist \
    client/package.json client/dist \
    deploy/frog.service deploy/nginx.conf.template deploy/remote.sh
  rm -f release.txt
}

case "${1:-release}" in
  release)
    for tool in node npm tar ssh scp; do
      command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }
    done
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
      echo "Note: you have uncommitted changes; they are included in this release."
    fi
    build_and_test
    stamp="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo local)"
    tarball="frog-$stamp.tgz" # relative: GNU tar reads "C:/..." as host:path
    say "Packaging $stamp"
    package "$stamp" "$tarball"
    trap 'rm -f "$tarball"' EXIT
    say "Uploading to $FROG_HOST"
    scp -q "$tarball" "$FROG_HOST:/tmp/frog-$stamp.tgz"
    remote release "$stamp"
    ;;

  password)
    (cd server && npx tsc -b >/dev/null)
    read -r -s -p "New Frog password: " pw
    echo
    read -r -s -p "Again: " pw2
    echo
    [ "$pw" = "$pw2" ] || { echo "Passwords do not match." >&2; exit 1; }
    # Piped (not a TTY), so the hasher reads it from stdin without echoing.
    line=$(printf '%s' "$pw" | node server/dist/scripts/hash-password.js)
    unset pw pw2
    hash=${line#PASSWORD_HASH=\'}
    hash=${hash%\'}
    remote password "'$hash'"
    ;;

  rollback) remote rollback ;;
  status) remote status ;;

  tunnel)
    port=${2:-3080}
    say "Open http://localhost:$port  (Ctrl+C to close the tunnel)"
    ssh -N -L "$port:127.0.0.1:3080" "$FROG_HOST"
    ;;

  https)
    domain=${2:?usage: deploy.sh https DOMAIN EMAIL}
    email=${3:?usage: deploy.sh https DOMAIN EMAIL}
    remote https "$domain" "$email"
    ;;

  backup)
    mkdir -p backups
    say "Copying /srv/frog/data/backups/daily to ./backups/daily"
    scp -r -q "$FROG_HOST:/srv/frog/data/backups/daily" backups/
    ls -1 backups/daily | tail -3
    ;;

  *)
    sed -n '2,15p' "$0"
    exit 1
    ;;
esac
