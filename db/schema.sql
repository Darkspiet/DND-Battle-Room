create table if not exists dm_profiles (
  id text primary key,
  username text unique not null check (username ~ '^[a-z0-9_.-]{3,32}$'),
  display_name text not null,
  color text not null default '#b7394b',
  avatar_url text,
  avatar_name text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dm_sessions (
  token_hash text primary key,
  profile_id text not null references dm_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists dm_rooms (
  id text primary key,
  room_code text unique not null,
  name text not null,
  dm_user_id text not null references dm_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public_library_items (
  id text primary key,
  kind text not null check (kind in ('token', 'object')),
  name text not null,
  category text not null,
  icon text not null,
  image_url text,
  image_name text,
  token_type text not null check (token_type in ('character', 'npc', 'monster', 'object')),
  size int not null default 1,
  hp text,
  note text,
  created_by text references dm_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists room_snapshots (
  room_code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists dm_sessions_profile_expires_idx
  on dm_sessions (profile_id, expires_at desc);

create index if not exists dm_rooms_dm_user_updated_idx
  on dm_rooms (dm_user_id, updated_at desc);

create index if not exists public_library_items_kind_updated_idx
  on public_library_items (kind, updated_at desc);

create index if not exists public_library_items_created_by_idx
  on public_library_items (created_by)
  where created_by is not null;

create index if not exists room_snapshots_updated_idx
  on room_snapshots (updated_at desc);


alter table room_snapshots add column if not exists revision bigint not null default 0;
create table if not exists guest_profiles (
  id text primary key,
  display_name text not null,
  color text not null,
  avatar_url text,
  avatar_name text,
  created_at timestamptz not null default now()
);
create table if not exists guest_sessions (
  token_hash text primary key,
  profile_id text not null references guest_profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists guest_sessions_expires_idx on guest_sessions(expires_at);
create index if not exists dm_sessions_expires_idx on dm_sessions(expires_at);
create table if not exists room_commands (
  room_code text not null references room_snapshots(room_code) on delete cascade,
  actor_id text not null,
  command_id text not null,
  created_at timestamptz not null default now(),
  primary key(room_code, actor_id, command_id)
);
create index if not exists room_commands_created_idx on room_commands(created_at);
