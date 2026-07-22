#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/DND}"
APP_USER="${APP_USER:-root}"
DB_NAME="${DB_NAME:-dnd_battle_room}"
DB_USER="${DB_USER:-dnd_battle_room}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -hex 24)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"
ENV_FILE="$APP_DIR/.env.production"

cd "$APP_DIR"

echo "Installing system packages..."
apt-get update
apt-get install -y postgresql postgresql-contrib nodejs npm

echo "Creating Postgres database and user..."
sudo -u postgres psql <<SQL
do \$\$
begin
  if not exists (select from pg_roles where rolname = '$DB_USER') then
    create role "$DB_USER" login password '$DB_PASSWORD';
  else
    alter role "$DB_USER" with password '$DB_PASSWORD';
  end if;
end
\$\$;
select 'create database "$DB_NAME" owner "$DB_USER"'
where not exists (select from pg_database where datname = '$DB_NAME')\gexec
grant all privileges on database "$DB_NAME" to "$DB_USER";
SQL

echo "Writing $ENV_FILE..."
cat > "$ENV_FILE" <<ENV
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME
SESSION_SECRET=$SESSION_SECRET
ENV
chmod 600 "$ENV_FILE"
chown "$APP_USER":"$APP_USER" "$ENV_FILE"

echo "Installing Node dependencies..."
npm install

echo "Applying database schema..."
set -a
. "$ENV_FILE"
set +a
npm run db:apply

echo "Building application..."
npm run build

echo "Installing systemd service..."
install -m 0644 deploy/dnd-battle-room.service /etc/systemd/system/dnd-battle-room.service
systemctl daemon-reload
systemctl enable dnd-battle-room
systemctl restart dnd-battle-room

echo "Verifying service..."
curl -I http://127.0.0.1:3000

echo "DND Battle Room installed. Environment: $ENV_FILE"
