#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
RELEASE_VERSION=v1.0.0
REPOSITORY=Darkspiet/DND-Battle-Room
APP_DIR=/opt/dnd-battle-room
NODE_DIR=/opt/dnd-battle-room-node
CONFIG_DIR=/etc/dnd-battle-room
CONFIG_FILE=$CONFIG_DIR/config.json
SERVICE=dnd-battle-room
STAGE=preflight
WORK=
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$WORK" && "$WORK" == /tmp/dnd-install.* ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
trap 'printf "Installation stopped during %s. Fix the issue and rerun this same version. Existing data and credentials are preserved.\n" "$STAGE" >&2' ERR

usage() {
  printf '%s\n' \
    'Usage: bash install.sh [--local-archive PATH]' \
    '' \
    '  --local-archive PATH  Install source from a local ZIP or tar archive instead' \
    '                        of downloading the tagged GitHub release.' \
    '  -h, --help            Show this help.'
}

LOCAL_ARCHIVE=
while (( $# > 0 )); do
  case "$1" in
    --local-archive)
      (( $# >= 2 )) || fail '--local-archive requires a path.'
      [[ -z "$LOCAL_ARCHIVE" ]] || fail '--local-archive may only be specified once.'
      [[ -n "$2" ]] || fail '--local-archive requires a nonempty path.'
      LOCAL_ARCHIVE=$2
      shift 2
      ;;
    --local-archive=*)
      [[ -z "$LOCAL_ARCHIVE" ]] || fail '--local-archive may only be specified once.'
      LOCAL_ARCHIVE=${1#*=}
      [[ -n "$LOCAL_ARCHIVE" ]] || fail '--local-archive requires a nonempty path.'
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1. Run with --help for usage."
      ;;
  esac
done

[[ -r /etc/os-release ]] || fail 'Ubuntu 24.04 is required.'
# shellcheck disable=SC1091
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || fail 'Only Ubuntu 24.04 is supported.'
case "$(uname -m)" in x86_64) NODE_ARCH=x64 ;; aarch64|arm64) NODE_ARCH=arm64 ;; *) fail 'Only x86-64 and ARM64 are supported.' ;; esac
command -v curl >/dev/null || fail 'Install curl first: sudo apt-get update && sudo apt-get install -y curl'
command -v python3 >/dev/null || fail 'Install python3 first: sudo apt-get install -y python3'
if [[ -n "$LOCAL_ARCHIVE" ]]; then
  [[ -f "$LOCAL_ARCHIVE" && -r "$LOCAL_ARCHIVE" ]] || fail "Local release archive is not a readable file: $LOCAL_ARCHIVE"
  LOCAL_ARCHIVE=$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).resolve(strict=True))' "$LOCAL_ARCHIVE")
fi
if (( EUID != 0 )); then
  command -v sudo >/dev/null || fail 'Run as root or install sudo.'
  sudo -v
  installer=$(mktemp /tmp/dnd-installer.XXXXXXXX.sh)
  if [[ -n "$LOCAL_ARCHIVE" ]]; then
    [[ -r "${BASH_SOURCE[0]}" ]] || fail 'Run local-archive mode from a readable install.sh file.'
    cp -- "${BASH_SOURCE[0]}" "$installer"
  else
    curl -fsSL --retry 3 "https://raw.githubusercontent.com/$REPOSITORY/$RELEASE_VERSION/install.sh" -o "$installer"
  fi
  chmod 700 "$installer"
  result=0
  if [[ -n "$LOCAL_ARCHIVE" ]]; then
    sudo bash "$installer" --local-archive "$LOCAL_ARCHIVE" || result=$?
  else
    sudo bash "$installer" || result=$?
  fi
  rm -f -- "$installer"
  exit "$result"
fi
exec 9>/run/lock/dnd-battle-room-install.lock
flock -n 9 || fail 'Another installation is already running.'
[[ -t 0 || -r /dev/tty ]] || fail 'Run from an interactive terminal.'
exec 3<>/dev/tty
confirm() {
  local answer
  read -r -u 3 -p "$1 [y/N]: " answer
  [[ "$answer" == y || "$answer" == Y ]] || fail 'Cancelled.'
}
prompt() {
  local key=$1 label=$2 default=${3:-} answer
  read -r -u 3 -p "$label${default:+ [$default]}: " answer
  printf -v "$key" '%s' "${answer:-$default}"
}
secret() {
  local key=$1 label=$2 answer repeat
  while true; do
    read -r -s -u 3 -p "$label: " answer; printf '\n' >&3
    read -r -s -u 3 -p 'Confirm password: ' repeat; printf '\n' >&3
    if [[ -n "$answer" && "$answer" == "$repeat" ]]; then printf -v "$key" '%s' "$answer"; return; fi
    printf 'Passwords must be nonempty and match.\n' >&3
  done
}
random_secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
postgres_run() { (cd /; runuser -u postgres -- "$@"); }
done_stage() { [[ -f "$CONFIG_DIR/$1.done" ]]; }
mark() { touch "$CONFIG_DIR/$1.done"; }

RESUME=false
if [[ -e "$CONFIG_DIR" ]]; then
  [[ -f "$CONFIG_DIR/installer-version" && "$(cat "$CONFIG_DIR/installer-version")" == "$RELEASE_VERSION" ]] || fail "Unrecognized installation at $CONFIG_DIR; no files were changed."
  [[ -f "$CONFIG_FILE" ]] || fail "Incomplete configuration at $CONFIG_DIR. Inspect it before retrying; do not delete database data."
  RESUME=true
  for component in service caddy; do
    if [[ -f "$CONFIG_DIR/$component.sha256" ]]; then
      sha256sum --check --status "$CONFIG_DIR/$component.sha256" || fail "The $component configuration changed outside the installer; refusing to overwrite it."
    fi
  done
else
  [[ ! -e "$APP_DIR" && ! -e "$NODE_DIR" ]] || fail 'Application/runtime directory already exists; migration is not supported.'
  ! getent passwd "$SERVICE" >/dev/null || fail 'The service user already exists.'
  ! getent group "$SERVICE" >/dev/null || fail 'The service group already exists.'
  [[ ! -e /etc/apt/sources.list.d/caddy-stable.list ]] || fail 'An existing Caddy package source was found; use a fresh server.'
  [[ ! -e /etc/caddy/Caddyfile ]] || fail 'An existing Caddy configuration was found; use a fresh server.'
  ! systemctl cat "$SERVICE" >/dev/null 2>&1 || fail 'An existing application service was found.'
  ! command -v psql >/dev/null || fail 'Existing PostgreSQL installation detected; use a fresh server.'
fi
for port in 80 443 3000 5432; do
  if ss -H -ltn "sport = :$port" | grep -q .; then
    if [[ "$RESUME" != true ]]; then fail "Port $port is already occupied; use a fresh server."; fi
    # Only installer-owned service ports may be reused during a retry.
    case "$port" in
      80|443) owner=caddy ;;
      3000) owner=$SERVICE ;;
      5432) owner=postgresql ;;
    esac
    systemctl is-active --quiet "$owner" || fail "Port $port conflicts with the expected $owner service."
    listeners=$(ss -H -ltnp "sport = :$port" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
    [[ -n "$listeners" ]] || fail "Cannot identify the process on port $port."
    while read -r listener; do
      if [[ "$port" == 5432 ]]; then
        grep -qE '/postgresql@[^/]+\.service$' "/proc/$listener/cgroup" || fail "Unrelated listener on port $port."
      else
        grep -qF "/$owner.service" "/proc/$listener/cgroup" || fail "Unrelated listener on port $port."
      fi
    done <<< "$listeners"
  fi
done
printf 'DND Battle Room %s - Ubuntu 24.04 installer\n' "$RELEASE_VERSION"
printf 'Before continuing: point your domain A/AAAA records to this machine, and allow inbound TCP 80/443.\nDNS, router forwarding and external firewall rules are your responsibility.\n'
WORK=$(mktemp -d /tmp/dnd-install.XXXXXXXX)
chmod 755 "$WORK"
mkdir "$WORK/source"
# Stage the release before modifying the system. Online retries always use this exact tag.
if [[ -n "$LOCAL_ARCHIVE" ]]; then
  STAGE='local release archive'
  python3 - "$LOCAL_ARCHIVE" "$WORK/source" <<'PY' || fail 'Could not extract the local release archive.'
import os
import shutil
import stat
import sys
import tarfile
import zipfile
from pathlib import Path, PurePosixPath

archive = Path(sys.argv[1])
destination = Path(sys.argv[2])


class InvalidArchive(Exception):
    pass


def safe_parts(name):
    if not name or "\\" in name or "\0" in name or ":" in name:
        raise InvalidArchive(f"unsafe member name: {name!r}")
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise InvalidArchive(f"unsafe member path: {name!r}")
    parts = tuple(part for part in path.parts if part not in ("", "."))
    if not parts:
        raise InvalidArchive(f"empty member path: {name!r}")
    return parts


def validate(records):
    if not records:
        raise InvalidArchive("archive is empty")
    if len(records) > 50000:
        raise InvalidArchive("archive has too many members")
    root = records[0][1][0]
    targets = set()
    validated = []
    for member, parts, is_directory, mode in records:
        if parts[0] != root:
            raise InvalidArchive("archive must contain exactly one top-level directory")
        if len(parts) == 1:
            if not is_directory:
                raise InvalidArchive("top-level archive entry must be a directory")
            continue
        relative = Path(*parts[1:])
        key = relative.as_posix()
        if key in targets:
            raise InvalidArchive(f"duplicate archive member: {key}")
        targets.add(key)
        validated.append((member, relative, is_directory, mode))
    if not validated:
        raise InvalidArchive("top-level directory is empty")
    return validated


def prepare_directories(records):
    for _, relative, is_directory, _ in records:
        if is_directory:
            target = destination / relative
            target.mkdir(parents=True, exist_ok=True)
            os.chmod(target, 0o755)


def write_file(source, relative, mode):
    target = destination / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("xb") as output:
        shutil.copyfileobj(source, output)
    os.chmod(target, 0o755 if mode & 0o111 else 0o644)


def extract_zip():
    with zipfile.ZipFile(archive) as source:
        records = []
        for member in source.infolist():
            parts = safe_parts(member.orig_filename)
            mode = (member.external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(mode)
            is_directory = member.is_dir() or file_type == stat.S_IFDIR
            if not is_directory and file_type not in (0, stat.S_IFREG):
                raise InvalidArchive(f"links and special files are not allowed: {member.filename!r}")
            records.append((member, parts, is_directory, mode))
        if sum(member.file_size for member in source.infolist()) > 512 * 1024 * 1024:
            raise InvalidArchive("archive exceeds the 512 MB extraction limit")
        records = validate(records)
        prepare_directories(records)
        for member, relative, is_directory, mode in records:
            if not is_directory:
                with source.open(member) as input_file:
                    write_file(input_file, relative, mode)


def extract_tar():
    with tarfile.open(archive, "r:*") as source:
        records = []
        for member in source.getmembers():
            if not (member.isdir() or member.isfile()):
                raise InvalidArchive(f"links and special files are not allowed: {member.name!r}")
            records.append((member, safe_parts(member.name), member.isdir(), member.mode))
        if sum(member.size for member in source.getmembers()) > 512 * 1024 * 1024:
            raise InvalidArchive("archive exceeds the 512 MB extraction limit")
        records = validate(records)
        prepare_directories(records)
        for member, relative, is_directory, mode in records:
            if not is_directory:
                input_file = source.extractfile(member)
                if input_file is None:
                    raise InvalidArchive(f"could not read archive member: {member.name!r}")
                with input_file:
                    write_file(input_file, relative, mode)


try:
    if zipfile.is_zipfile(archive):
        extract_zip()
    elif tarfile.is_tarfile(archive):
        extract_tar()
    else:
        raise InvalidArchive("expected a ZIP or tar archive")
except (InvalidArchive, OSError, tarfile.TarError, zipfile.BadZipFile) as error:
    print(f"Invalid local release archive: {error}", file=sys.stderr)
    raise SystemExit(1)
PY
else
  STAGE='release download'
  curl -fsSL --retry 3 "https://codeload.github.com/$REPOSITORY/tar.gz/refs/tags/$RELEASE_VERSION" -o "$WORK/release.tar.gz"
  tar -xzf "$WORK/release.tar.gz" --strip-components=1 -C "$WORK/source"
fi
if [[ -n "$LOCAL_ARCHIVE" ]]; then release_hash=$(sha256sum "$LOCAL_ARCHIVE"); else release_hash=$(sha256sum "$WORK/release.tar.gz"); fi
release_hash=${release_hash%% *}
if [[ "$RESUME" == true ]]; then
  [[ -f "$CONFIG_DIR/release.sha256" && "$(cat "$CONFIG_DIR/release.sha256")" == "$release_hash" ]] || fail 'Retry requires the exact original archive from this installer. This is not an updater; keep existing data and use the documented manual update procedure.'
fi
HELPER=$WORK/source/scripts/installer-config.py
[[ -f "$HELPER" ]] || fail 'Release archive is missing installer configuration helper.'
STAGE=configuration
DM_PASSWORD=
if [[ "$RESUME" == true ]]; then
  python3 "$HELPER" read "$CONFIG_FILE" > "$WORK/settings"
  mapfile -d '' -t settings < "$WORK/settings"
  SITE_NAME=${settings[0]}; DOMAIN=${settings[1]}; DM_USERNAME=${settings[2]}; DM_NAME=${settings[3]}
  DB_NAME=${settings[4]}; DB_USER=${settings[5]}; DB_PASSWORD=${settings[6]}
  rm -f "$WORK/settings"
  printf 'Resuming saved configuration; existing credentials will be preserved.\n'
else
  prompt SITE_NAME 'Website name' 'DND Battle Room'
  prompt DOMAIN 'Public domain (example: battles.example.com)'
  DOMAIN=${DOMAIN,,}
  prompt DM_USERNAME 'First DM username (lowercase)' 'gamemaster'
  prompt DM_NAME 'First DM display name' 'Game Master'
  prompt DB_NAME 'PostgreSQL database name' 'dnd_battle_room'
  prompt DB_USER 'PostgreSQL username' 'dnd_battle_room'
  choice=
  read -r -u 3 -p 'Generate a secure database password? [Y/n]: ' choice
  if [[ "$choice" == n || "$choice" == N ]]; then secret DB_PASSWORD 'Database password (at least 16 characters)'; else DB_PASSWORD=$(random_secret); fi
  printf '%s\0' "$SITE_NAME" "$DOMAIN" "$DM_USERNAME" "$DM_NAME" "$DB_NAME" "$DB_USER" "$DB_PASSWORD" | python3 "$HELPER" create "$WORK/config.json"
fi
if ! done_stage bootstrap; then
  secret DM_PASSWORD 'First DM password (at least 12 characters)'
  (( ${#DM_PASSWORD} >= 12 )) || fail 'The first DM password needs at least 12 characters.'
fi
printf '\nWebsite: %s\nURL: https://%s\nFirst DM: %s (%s)\nDatabase: %s (user %s)\nApplication: %s\nSecrets omitted.\n' "$SITE_NAME" "$DOMAIN" "$DM_USERNAME" "$DM_NAME" "$DB_NAME" "$DB_USER" "$APP_DIR"
confirm 'Install/resume these settings?'
if [[ "$RESUME" != true ]]; then
  # Publish recovery configuration and ownership marker together.
  config_staging=$(mktemp -d /etc/.dnd-battle-room.XXXXXXXX)
  install -m 600 "$WORK/config.json" "$config_staging/config.json"
  printf '%s\n' "$RELEASE_VERSION" > "$config_staging/installer-version"
  printf '%s\n' "$release_hash" > "$config_staging/release.sha256"
  mv -T -- "$config_staging" "$CONFIG_DIR"
fi
STAGE='system dependencies'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl xz-utils postgresql postgresql-contrib debian-keyring debian-archive-keyring apt-transport-https
systemctl enable --now postgresql
listen_addresses=$(postgres_run psql -Atqc 'show listen_addresses')
[[ "$listen_addresses" == localhost || "$listen_addresses" == 127.0.0.1 ]] || fail 'PostgreSQL is not configured for loopback-only access.'
if ! getent passwd "$SERVICE" >/dev/null; then useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE"; fi
chown root:"$SERVICE" "$CONFIG_DIR" "$CONFIG_FILE"
chmod 750 "$CONFIG_DIR"
chmod 640 "$CONFIG_FILE"
if ! done_stage source; then
  install -d -o "$SERVICE" -g "$SERVICE" -m 750 "$APP_DIR"
  cp -a "$WORK/source/." "$APP_DIR/"
  chown -R "$SERVICE":"$SERVICE" "$APP_DIR"
  mark source
fi
STAGE='Node.js 24 LTS'
if ! done_stage node; then
  curl -fsSL --retry 3 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$WORK/SHASUMS256.txt"
  archive=$(awk -v arch="$NODE_ARCH" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' "$WORK/SHASUMS256.txt")
  [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || fail 'Could not resolve Node.js 24 archive.'
  curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$WORK/$archive"
  (cd "$WORK"; grep -F "  $archive" SHASUMS256.txt | sha256sum --check --status)
  install -d -m 755 "$NODE_DIR"
  tar -xJf "$WORK/$archive" --strip-components=1 -C "$NODE_DIR"
  mark node
fi
export PATH="$NODE_DIR/bin:$PATH"
export DND_CONFIG_FILE="$CONFIG_FILE"
app_run() { runuser -u "$SERVICE" -- env PATH="$PATH" DND_CONFIG_FILE="$CONFIG_FILE" "$@"; }
cd "$APP_DIR"
STAGE='Node dependencies'
if ! done_stage dependencies; then
  app_run npm ci --no-audit --no-fund
  mark dependencies
fi
[[ -f node_modules/next/package.json ]] || fail 'Completed dependency installation is missing files; inspect the app directory.'
STAGE='dependency security audit'
app_run npm audit --omit=dev --audit-level=high
STAGE='PostgreSQL provisioning'
# Record intent before creation so interruption can resume without changing a password.
if ! done_stage database_started; then
  existing=$(postgres_run psql -Atqc "select count(*) from pg_roles where rolname = '$DB_USER'")
  [[ "$existing" == 0 ]] || fail 'Database role already exists; refusing to change its password.'
  existing=$(postgres_run psql -Atqc "select count(*) from pg_database where datname = '$DB_NAME'")
  [[ "$existing" == 0 ]] || fail 'Database already exists; refusing to overwrite it.'
  mark database_started
fi
existing=$(postgres_run psql -Atqc "select count(*) from pg_roles where rolname = '$DB_USER'")
if [[ "$existing" == 0 ]]; then
  python3 "$HELPER" sql "$CONFIG_FILE" | postgres_run psql -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 || fail 'Could not create PostgreSQL role; credentials were not logged.'
fi
existing=$(postgres_run psql -Atqc "select count(*) from pg_database where datname = '$DB_NAME'")
if [[ "$existing" == 0 ]]; then postgres_run createdb --owner="$DB_USER" -- "$DB_NAME"; fi
owner=$(postgres_run psql -Atqc "select pg_get_userbyid(datdba) from pg_database where datname = '$DB_NAME'")
[[ "$owner" == "$DB_USER" ]] || fail 'Database ownership differs from installer configuration.'
# Probe credentials without printing connection strings or database errors.
app_run node --import ./scripts/load-config.mjs --input-type=module -e 'import {Pool} from "pg"; const p=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000}); try{await p.query("select 1")}catch{console.error("Database connection failed; check saved configuration.");process.exitCode=1}finally{await p.end()}'
app_run node --import ./scripts/load-config.mjs scripts/apply-db-schema.mjs
if ! done_stage bootstrap; then
  printf '%s\0' "$DM_USERNAME" "$DM_PASSWORD" "$DM_NAME" | app_run node scripts/bootstrap-dm.mjs
  unset DM_PASSWORD
  mark bootstrap
fi
STAGE='production build'
if ! done_stage build; then
  app_run node --import ./scripts/load-config.mjs "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" run build
  mark build
fi
[[ -f .next/BUILD_ID ]] || fail 'Completed production build is missing; inspect the app directory.'
install -d -o "$SERVICE" -g "$SERVICE" -m 750 /var/lib/dnd-battle-room/assets
STAGE='application service'
install -m 644 "$WORK/source/deploy/dnd-battle-room.service" /etc/systemd/system/dnd-battle-room.service
sha256sum /etc/systemd/system/dnd-battle-room.service > "$CONFIG_DIR/service.sha256"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || fail 'Application did not become ready. Inspect journalctl -u dnd-battle-room.'
STAGE='Caddy HTTPS'
if ! done_stage caddy_repository; then
  curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$WORK/caddy.asc"
  install -m 644 "$WORK/caddy.asc" /usr/share/keyrings/caddy-stable-archive-keyring.asc
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.asc] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main' > /etc/apt/sources.list.d/caddy-stable.list
  mark caddy_repository
fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
printf '%s {\n    reverse_proxy 127.0.0.1:3000\n}\n' "$DOMAIN" > "$WORK/Caddyfile"
chmod 644 "$WORK/Caddyfile"
caddy validate --config "$WORK/Caddyfile" --adapter caddyfile
install -m 644 "$WORK/Caddyfile" /etc/caddy/Caddyfile
sha256sum /etc/caddy/Caddyfile > "$CONFIG_DIR/caddy.sha256"
systemctl enable --now caddy
systemctl reload caddy
STAGE='public HTTPS verification'
ready=false
for ((attempt=0; attempt<30; attempt++)); do
  if curl -fsS --connect-timeout 5 --max-time 10 "https://$DOMAIN/api/health" >/dev/null; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || fail 'HTTPS is not ready. Check DNS, inbound 80/443, and journalctl -u caddy, then rerun.'
mark complete
printf '\nInstallation verified.\nWebsite: https://%s\nDM login: https://%s/dm/login\nConfiguration: %s\n' "$DOMAIN" "$DOMAIN" "$CONFIG_FILE"
printf 'Status: systemctl status dnd-battle-room caddy\nLogs: journalctl -u dnd-battle-room -u caddy -f\n'
