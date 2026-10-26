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
CADDY_CONFIG=/etc/caddy/Caddyfile
CADDY_SITE=/etc/caddy/dnd-battle-room.caddy
STAGE=preflight
WORK=
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
cleanup() { if [[ -n "$WORK" && "$WORK" == /tmp/dnd-install.* ]]; then rm -rf -- "$WORK"; fi; }
trap cleanup EXIT
trap 'printf "Operation stopped during %s. Inspect the error and retry; existing data and credentials are preserved.\n" "$STAGE" >&2' ERR

usage() {
  printf '%s\n' \
    'Usage: bash install.sh [--install | --uninstall] [--local-archive PATH]' \
    '' \
    '  --local-archive PATH  Install source from a local ZIP or tar archive instead' \
    '                        of downloading the tagged GitHub release.' \
    '  --install            Install/resume without showing the action menu.' \
    '  --uninstall          Remove the application; keep database, uploads,' \
    '                        protected configuration and shared dependencies.' \
    '  -h, --help            Show this help.'
}

LOCAL_ARCHIVE=
ACTION=menu
while (( $# > 0 )); do
  case "$1" in
    --install|--uninstall)
      [[ "$ACTION" == menu ]] || fail 'Choose only one action.'
      ACTION=${1#--}
      shift
      ;;
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
[[ "$ACTION" != uninstall || -z "$LOCAL_ARCHIVE" ]] || fail '--uninstall does not need a source archive.'
if (( EUID == 0 )); then export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; fi

[[ -r /etc/os-release ]] || fail 'Ubuntu 24.04 is required.'
# shellcheck disable=SC1091
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || fail 'Only Ubuntu 24.04 is supported.'
case "$(uname -m)" in x86_64) NODE_ARCH=x64 ;; aarch64|arm64) NODE_ARCH=arm64 ;; *) fail 'Only x86-64 and ARM64 are supported.' ;; esac
command -v python3 >/dev/null || fail 'Install python3 first: sudo apt-get install -y python3'
if [[ -n "$LOCAL_ARCHIVE" ]]; then
  [[ -f "$LOCAL_ARCHIVE" && -r "$LOCAL_ARCHIVE" ]] || fail "Local release archive is not a readable file: $LOCAL_ARCHIVE"
  LOCAL_ARCHIVE=$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).resolve(strict=True))' "$LOCAL_ARCHIVE")
fi
if (( EUID != 0 )); then
  command -v sudo >/dev/null || fail 'Run as root or install sudo.'
  sudo -v
  installer=$(mktemp /tmp/dnd-installer.XXXXXXXX.sh)
  if [[ -f "${BASH_SOURCE[0]}" && -r "${BASH_SOURCE[0]}" ]]; then
    cp -- "${BASH_SOURCE[0]}" "$installer"
  else
    command -v curl >/dev/null || fail 'Run from a saved install.sh file, or install curl first.'
    curl -fsSL --retry 3 "https://raw.githubusercontent.com/$REPOSITORY/$RELEASE_VERSION/install.sh" -o "$installer"
  fi
  chmod 700 "$installer"
  result=0
  root_arguments=()
  if [[ "$ACTION" != menu ]]; then root_arguments+=("--$ACTION"); fi
  if [[ -n "$LOCAL_ARCHIVE" ]]; then root_arguments+=(--local-archive "$LOCAL_ARCHIVE"); fi
  sudo bash "$installer" "${root_arguments[@]}" || result=$?
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
postgres_run() { (cd /; runuser -u postgres -- env -i PATH=/usr/bin:/bin PGHOST=/var/run/postgresql PGPORT=5432 PGDATABASE=postgres "$@"); }
done_stage() { [[ -f "$CONFIG_DIR/$1.done" ]]; }
mark() { touch "$CONFIG_DIR/$1.done"; }

# BEGIN LIFECYCLE HELPERS
trusted_system_tool() {
  local target
  target=$(readlink -f "$1") || return 1
  [[ "$target" == /usr/* ]] || return 1
  while [[ "$target" != / ]]; do
    [[ "$(stat -c %u "$target")" == 0 ]] || return 1
    (( (8#$(stat -c %a "$target") & 8#022) == 0 )) || return 1
    target=$(dirname -- "$target")
  done
}

dependency_packages() {
  local package
  for package in ca-certificates curl xz-utils; do
    if [[ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" != 'install ok installed' ]]; then printf '%s\n' "$package"; fi
  done
  if ! command -v pg_lsclusters >/dev/null || ! pg_lsclusters --no-header | grep -q .; then printf '%s\n' postgresql postgresql-contrib; fi
}

reuse_node_runtime() {
  local system_node system_npm
  system_node=$(command -v node || true)
  system_npm=$(command -v npm || true)
  [[ -n "$system_node" && -n "$system_npm" ]] || return 1
  trusted_system_tool "$system_node" && trusted_system_tool "$system_npm" || return 1
  [[ "$("$system_node" -p 'process.versions.node.split(".")[0]')" == 24 ]] || return 1
  install -d -m 755 "$NODE_DIR/bin"
  ln -sfn -- "$(readlink -f "$system_node")" "$NODE_DIR/bin/node"
  ln -sfn -- "$(readlink -f "$system_npm")" "$NODE_DIR/bin/npm"
}

require_owned_install() {
  local target
  for target in "$CONFIG_DIR" "$CONFIG_FILE" "$CONFIG_DIR/installer-version"; do
    [[ -e "$target" && ! -L "$target" ]] || fail "Missing or symlinked installation metadata: $target"
    [[ "$(stat -c %u "$target")" == 0 ]] || fail "Installation metadata must be root-owned: $target"
    (( (8#$(stat -c %a "$target") & 8#022) == 0 )) || fail "Installation metadata is writable by another account: $target"
  done
  for target in "$CONFIG_DIR/"*.sha256 "$CONFIG_DIR/"*.done; do
    [[ -e "$target" || -L "$target" ]] || continue
    [[ -f "$target" && ! -L "$target" && "$(stat -c %u "$target")" == 0 ]] || fail 'Installer ownership markers must be regular root-owned files.'
    (( (8#$(stat -c %a "$target") & 8#022) == 0 )) || fail 'Installer ownership markers must not be writable by another account.'
  done
}

rewrite_caddy_config() {
  python3 - "$1" "$2" "$CADDY_SITE" "$3" <<'PY_CADDY'
import pathlib
import sys

source, destination, site, action = sys.argv[1:]
begin, end = '# BEGIN DND BATTLE ROOM', '# END DND BATTLE ROOM'
text = pathlib.Path(source).read_text() if pathlib.Path(source).exists() else ''
if text.count(begin) != text.count(end) or text.count(begin) > 1:
    raise SystemExit('Caddy contains an incomplete or duplicate Battle Room import block; inspect it manually.')
if begin in text:
    start = text.index(begin)
    finish = text.index(end) + len(end)
    block = text[start:finish]
    expected = f'{begin}\nimport {site}\n{end}'
    if block != expected:
        raise SystemExit('The Battle Room import block was edited; inspect it manually.')
    if finish < len(text) and text[finish] == '\n': finish += 1
    text = text[:start] + text[finish:]
if action == 'add':
    text = text.rstrip('\n') + f'\n{begin}\nimport {site}\n{end}\n'
elif action != 'remove':
    raise SystemExit('Invalid Caddy configuration action.')
pathlib.Path(destination).write_text(text)
PY_CADDY
}

rollback_caddy_site() {
  if [[ -f "$WORK/site.previous" ]]; then
    install -m 644 "$WORK/site.previous" "$CADDY_SITE"
  else
    rm -f -- "$CADDY_SITE" "$CONFIG_DIR/caddy-site.sha256" "$CONFIG_DIR/proxy_site_started.done"
  fi
}

write_caddy_config() {
  local mode=644 owner=0 group=0
  if [[ -f "$CADDY_CONFIG" ]]; then
    mode=$(command stat -c %a "$CADDY_CONFIG")
    owner=$(command stat -c %u "$CADDY_CONFIG")
    group=$(command stat -c %g "$CADDY_CONFIG")
  fi
  install -m "$mode" -o "$owner" -g "$group" "$1" "$CADDY_CONFIG"
}

remove_caddy_site() {
  [[ -f "$CONFIG_DIR/caddy-site.sha256" ]] || return 0
  [[ ! -L "$CADDY_CONFIG" && ! -L "$CADDY_SITE" ]] || fail 'Caddy configuration is symlinked; remove the Battle Room site manually.'
  sha256sum --check --status "$CONFIG_DIR/caddy-site.sha256" || fail 'Battle Room Caddy site was changed; inspect it before uninstalling.'
  rewrite_caddy_config "$CADDY_CONFIG" "$WORK/Caddyfile.remove" remove
  caddy validate --config "$WORK/Caddyfile.remove" --adapter caddyfile
  cp -- "$CADDY_CONFIG" "$WORK/Caddyfile.previous"
  write_caddy_config "$WORK/Caddyfile.remove"
  if systemctl is-active --quiet caddy && ! systemctl reload caddy; then
    write_caddy_config "$WORK/Caddyfile.previous"
    fail 'Caddy rejected the change. Its previous configuration was restored; no application files were removed.'
  fi
  rm -f -- "$CADDY_SITE" "$CONFIG_DIR/caddy-site.sha256" "$CONFIG_DIR/proxy_site_started.done"
}

uninstall_app() {
  STAGE=uninstall
  require_owned_install
  # These fixed paths are the only directories this operation may remove.
  [[ "$APP_DIR" == /opt/dnd-battle-room && "$NODE_DIR" == /opt/dnd-battle-room-node ]] || fail 'Unexpected application paths; refusing uninstall.'
  [[ ! -L "$APP_DIR" && ! -L "$NODE_DIR" ]] || fail 'Application/runtime path is a symlink; inspect it manually.'
  command -v findmnt >/dev/null || fail 'findmnt is required to check for mounted data before uninstalling.'
  local mounted mounts
  mounts=$(findmnt -rn -o TARGET) || fail 'Cannot inspect mounted data; uninstall was not started.'
  while IFS= read -r mounted; do
    case "$mounted" in
      "$APP_DIR"|"$APP_DIR"/*|"$NODE_DIR"|"$NODE_DIR"/*) fail 'Mounted data exists inside the application/runtime directory. Unmount it before uninstalling; no files were removed.' ;;
    esac
  done <<< "$mounts"
  python3 - "$CONFIG_FILE" "$APP_DIR" "$NODE_DIR" <<'PY_UNINSTALL'
import json
import pathlib
import sys
config = json.loads(pathlib.Path(sys.argv[1]).read_text())
app, runtime = (pathlib.Path(value).resolve() for value in sys.argv[2:])
media = pathlib.Path(config.get('ASSET_DIR', '/var/lib/dnd-battle-room/assets'))
media = (app / media).resolve() if not media.is_absolute() else media.resolve()
if any(media == target or target in media.parents for target in (app, runtime)):
    raise SystemExit('Uploads are inside the application/runtime directory. Move them outside it and update ASSET_DIR before uninstalling.')
PY_UNINSTALL
  if [[ -e /etc/systemd/system/dnd-battle-room.service ]]; then
    [[ -f "$CONFIG_DIR/service.sha256" ]] || fail 'Service ownership is not recorded; inspect the unit manually.'
    sha256sum --check --status "$CONFIG_DIR/service.sha256" || fail 'Service unit was edited; inspect it before uninstalling.'
  fi
  printf 'Remove: %s, %s and the Battle Room service/proxy site.\n' "$APP_DIR" "$NODE_DIR"
  printf 'Keep: PostgreSQL databases/roles, uploaded media, %s, the service user, and system packages.\n' "$CONFIG_DIR"
  local answer
  read -r -u 3 -p 'Type UNINSTALL to continue: ' answer
  [[ "$answer" == UNINSTALL ]] || fail 'Cancelled.'
  WORK=$(mktemp -d /tmp/dnd-install.XXXXXXXX)
  chmod 755 "$WORK"
  remove_caddy_site
  # Older installers owned the entire Caddyfile: never guess how to remove it.
  if [[ -f "$CONFIG_DIR/caddy.sha256" && ! -f "$CONFIG_DIR/caddy-site.sha256" ]]; then
    printf 'Legacy Caddy configuration retained at %s; remove its Battle Room site manually.\n' "$CADDY_CONFIG"
  fi
  if [[ -e /etc/systemd/system/dnd-battle-room.service ]]; then
    systemctl disable --now "$SERVICE"
    rm -f -- /etc/systemd/system/dnd-battle-room.service
    systemctl daemon-reload
  fi
  rm -rf --one-file-system -- "$APP_DIR" "$NODE_DIR"
  rm -f -- "$CONFIG_DIR/source.done" "$CONFIG_DIR/node.done" "$CONFIG_DIR/dependencies.done" "$CONFIG_DIR/build.done" "$CONFIG_DIR/complete.done" "$CONFIG_DIR/service.sha256" "$CONFIG_DIR/caddy.sha256"
  mark uninstalled
  printf 'Application removed. Campaigns, credentials, uploads and shared dependencies were preserved.\nReinstall uses the retained configuration and never resets accounts.\n'
}
# END LIFECYCLE HELPERS

if [[ "$ACTION" == menu ]]; then
  printf 'DND Battle Room\n  1) Install / resume / reinstall\n  2) Uninstall application (keep campaigns and uploads)\n  3) Exit\n'
  read -r -u 3 -p 'Choose [1]: ' action_choice
  case "${action_choice:-1}" in 1) ACTION=install ;; 2) ACTION=uninstall ;; 3) exit 0 ;; *) fail 'Choose 1, 2 or 3.' ;; esac
fi
if [[ "$ACTION" == uninstall ]]; then uninstall_app; exit 0; fi
command -v curl >/dev/null || fail 'Install curl first: sudo apt-get update && sudo apt-get install -y curl'

RESUME=false
REINSTALL=false
if [[ -e "$CONFIG_DIR" ]]; then
  require_owned_install
  if done_stage uninstalled; then REINSTALL=true;
  else [[ "$(cat "$CONFIG_DIR/installer-version")" == "$RELEASE_VERSION" ]] || fail "Use the original installer to resume this installation, or uninstall while keeping data before reinstalling a reviewed compatible release."
  fi
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
  ! systemctl cat "$SERVICE" >/dev/null 2>&1 || fail 'An existing application service was found.'
fi
PROXY_MODE=caddy
if [[ "$RESUME" == true ]]; then
  PROXY_MODE=$(python3 -c 'import json,sys; v=json.load(open(sys.argv[1])).get("INSTALL_PROXY_MODE","caddy"); assert v in ("caddy","external"); print(v)' "$CONFIG_FILE")
fi
if [[ "$RESUME" != true || "$REINSTALL" == true ]]; then
  printf 'HTTPS proxy:\n  1) Install/reuse Caddy and add a Battle Room site\n  2) Use an existing reverse proxy/tunnel (configure routing yourself)\n'
  proxy_default=1
  if [[ "$PROXY_MODE" == external ]]; then proxy_default=2; fi
  read -r -u 3 -p "Choose [$proxy_default]: " proxy_choice
  case "${proxy_choice:-$proxy_default}" in 1) PROXY_MODE=caddy ;; 2) PROXY_MODE=external ;; *) fail 'Choose 1 or 2.' ;; esac
fi
if [[ "$PROXY_MODE" == caddy ]]; then
  [[ ! -L "$CADDY_CONFIG" && ! -L "$CADDY_SITE" ]] || fail 'Symlinked Caddy configuration is unsupported; choose existing-proxy mode instead.'
  if [[ "$RESUME" != true && -e "$CADDY_SITE" ]]; then fail 'A Battle Room Caddy site already exists; inspect it before installing.'; fi
  if systemctl cat caddy >/dev/null 2>&1; then
    systemctl show -p ExecStart --value caddy | grep -qE -- '--config[= ]+/etc/caddy/Caddyfile([[:space:];"]|$)' || fail 'Caddy uses a custom config path; choose existing-proxy mode instead.'
  fi
fi
for port in 80 443 3000 5432; do
  if [[ "$PROXY_MODE" == external && ( "$port" == 80 || "$port" == 443 ) ]]; then continue; fi
  if ss -H -ltn "sport = :$port" | grep -q .; then
    if [[ "$port" == 5432 ]]; then
      existing_pg_version=$(postgres_run psql -wX -Atqc 'show server_version_num' 2>/dev/null) || fail 'Port 5432 is occupied by an unavailable or unrelated database. Use a local PostgreSQL cluster accessible as the postgres system user.'
      (( existing_pg_version >= 160000 )) || fail 'PostgreSQL 16 or newer is required. Back up and upgrade the existing cluster manually first.'
      continue
    fi
    if [[ "$port" == 3000 && "$RESUME" != true ]]; then fail 'Port 3000 is already occupied. Stop or move that unrelated application first.'; fi
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
printf 'Before continuing: configure DNS and public HTTPS for your domain. Caddy mode requires inbound TCP 80/443.\nExisting-proxy mode requires routing the domain to this app yourself.\n'
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
if [[ "$RESUME" == true && "$REINSTALL" != true ]]; then
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
  printf '%s\0' "$SITE_NAME" "$DOMAIN" "$DM_USERNAME" "$DM_NAME" "$DB_NAME" "$DB_USER" "$DB_PASSWORD" | python3 "$HELPER" create "$WORK/config.json" "$PROXY_MODE"
fi
if ! done_stage bootstrap; then
  secret DM_PASSWORD 'First DM password (at least 12 characters)'
  (( ${#DM_PASSWORD} >= 12 )) || fail 'The first DM password needs at least 12 characters.'
fi
if [[ "$RESUME" != true ]] && command -v psql >/dev/null && postgres_run psql -wX -Atqc 'select 1' >/dev/null 2>&1; then
  existing=$(postgres_run psql -wX -Atqc "select count(*) from pg_roles where rolname = '$DB_USER'")
  [[ "$existing" == 0 ]] || fail 'That PostgreSQL role already exists. Rerun and choose a new dedicated database username; its credentials were not changed.'
  existing=$(postgres_run psql -wX -Atqc "select count(*) from pg_database where datname = '$DB_NAME'")
  [[ "$existing" == 0 ]] || fail 'That database already exists. Rerun and choose a new database name; existing data was not changed.'
fi
printf '\nWebsite: %s\nURL: https://%s\nFirst DM: %s (%s)\nDatabase: %s (user %s)\nApplication: %s\nProxy: %s\nExisting system packages and unrelated databases/sites will be preserved.\nSecrets omitted.\n' "$SITE_NAME" "$DOMAIN" "$DM_USERNAME" "$DM_NAME" "$DB_NAME" "$DB_USER" "$APP_DIR" "$PROXY_MODE"
confirm 'Install/resume these settings?'
if [[ "$RESUME" != true ]]; then
  # Publish recovery configuration and ownership marker together.
  config_staging=$(mktemp -d /etc/.dnd-battle-room.XXXXXXXX)
  install -m 600 "$WORK/config.json" "$config_staging/config.json"
  printf '%s\n' "$RELEASE_VERSION" > "$config_staging/installer-version"
  printf '%s\n' "$release_hash" > "$config_staging/release.sha256"
  mv -T -- "$config_staging" "$CONFIG_DIR"
fi
if [[ "$REINSTALL" == true ]]; then
  python3 "$HELPER" set-proxy "$CONFIG_FILE" "$PROXY_MODE"
  printf '%s\n' "$RELEASE_VERSION" > "$CONFIG_DIR/installer-version"
  printf '%s\n' "$release_hash" > "$CONFIG_DIR/release.sha256"
  rm -f -- "$CONFIG_DIR/uninstalled.done"
fi
STAGE='system dependencies'
mapfile -t packages < <(dependency_packages)
if (( ${#packages[@]} )); then apt-get update; DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"; fi
systemctl enable --now postgresql
pg_version=$(postgres_run psql -wX -Atqc 'show server_version_num') || fail 'Start an existing local PostgreSQL cluster on port 5432, accessible as the postgres system user.'
(( pg_version >= 160000 )) || fail 'PostgreSQL 16 or newer is required. Upgrade an older cluster manually after backing it up.'
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
  if reuse_node_runtime; then
    printf 'Reusing installed Node.js 24 and npm; their system files will not be replaced.\n'
  else
  curl -fsSL --retry 3 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$WORK/SHASUMS256.txt"
  archive=$(awk -v arch="$NODE_ARCH" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' "$WORK/SHASUMS256.txt")
  [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || fail 'Could not resolve Node.js 24 archive.'
  curl -fsSL --retry 3 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$WORK/$archive"
  (cd "$WORK"; grep -F "  $archive" SHASUMS256.txt | sha256sum --check --status)
  install -d -m 755 "$NODE_DIR"
  tar -xJf "$WORK/$archive" --strip-components=1 -C "$NODE_DIR"
  fi
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
legacy_schema=$(postgres_run psql -wX -d "$DB_NAME" -Atqc "select to_regclass('public.dm_profiles') is not null")
[[ "$legacy_schema" == f ]] || fail 'The retained database uses the earlier simple-room schema. Automatic migration is unsupported; keep its backup and migrate manually or select a separate empty database.'
app_run node --import ./scripts/load-config.mjs scripts/apply-db-schema.mjs
if ! done_stage bootstrap; then
  printf '%s\0' "$DM_USERNAME" "$DM_PASSWORD" "$DM_NAME" | app_run node scripts/bootstrap-dm.mjs
  unset DM_PASSWORD
  mark bootstrap
fi
STAGE='production build'
if ! done_stage build; then
app_run node --import ./scripts/load-config.mjs "$(readlink -f "$(command -v npm)")" run build
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
if [[ "$PROXY_MODE" == caddy ]]; then
if ! command -v caddy >/dev/null; then
if ! done_stage caddy_repository && [[ ! -e /etc/apt/sources.list.d/caddy-stable.list ]]; then
  curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$WORK/caddy.asc"
  install -m 644 "$WORK/caddy.asc" /usr/share/keyrings/caddy-stable-archive-keyring.asc
  printf '%s\n' 'deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.asc] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main' > /etc/apt/sources.list.d/caddy-stable.list
  mark caddy_repository
fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
fi
[[ ! -L "$CADDY_CONFIG" && ! -L "$CADDY_SITE" ]] || fail 'Caddy configuration became symlinked; inspect it manually.'
install -d -m 755 /etc/caddy
printf '%s {\n    reverse_proxy 127.0.0.1:3000\n}\n' "$DOMAIN" > "$WORK/site.caddy"
if [[ -e "$CADDY_SITE" ]]; then
  done_stage proxy_site_started || fail 'An unrelated file occupies the Battle Room Caddy site path.'
  cmp -s "$CADDY_SITE" "$WORK/site.caddy" || fail 'The Battle Room Caddy site was edited; inspect it manually.'
  cp -- "$CADDY_SITE" "$WORK/site.previous"
fi
if [[ ! -f "$CONFIG_DIR/Caddyfile.before-install" && -f "$CADDY_CONFIG" ]]; then install -m 600 "$CADDY_CONFIG" "$CONFIG_DIR/Caddyfile.before-install"; fi
if [[ -f "$CADDY_CONFIG" ]]; then cp -- "$CADDY_CONFIG" "$WORK/Caddyfile.previous"; else touch "$WORK/Caddyfile.previous"; fi
mark proxy_site_started
install -m 644 "$WORK/site.caddy" "$CADDY_SITE"
sha256sum "$CADDY_SITE" > "$CONFIG_DIR/caddy-site.sha256"
rewrite_caddy_config "$CADDY_CONFIG" "$WORK/Caddyfile" add
if ! caddy validate --config "$WORK/Caddyfile" --adapter caddyfile; then
  rollback_caddy_site
  fail 'Combined Caddy configuration is invalid. Existing Caddyfile was not changed. Inspect duplicate domains/imports, or use existing-proxy mode on a new install.'
fi
write_caddy_config "$WORK/Caddyfile"
systemctl enable --now caddy
if ! systemctl reload caddy; then
  write_caddy_config "$WORK/Caddyfile.previous"
  rollback_caddy_site
  fail 'Caddy reload failed; the previous Caddyfile was restored. Inspect journalctl -u caddy before retrying.'
fi
else
  printf 'Existing-proxy mode: configure https://%s to proxy HTTP and WebSocket traffic to 127.0.0.1:3000 on this server.\n' "$DOMAIN"
  read -r -u 3 -p 'Press Enter after configuring the route to verify public HTTPS. '
fi
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
