create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  dm_guest_id text not null,
  grid jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  guest_id text not null,
  nickname text not null,
  color text not null,
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, guest_id)
);

create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  owner_guest_id text not null,
  owner_name text not null,
  name text not null,
  icon text not null,
  color text not null,
  type text not null check (type in ('character', 'npc', 'monster', 'object')),
  x int not null default 0,
  y int not null default 0,
  size int not null default 1,
  hp text,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists drawings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  owner_guest_id text not null,
  color text not null,
  points jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists dice_rolls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  guest_id text not null,
  user_name text not null,
  expression text not null,
  total int not null,
  parts text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists initiative_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  token_id uuid not null references tokens(id) on delete cascade,
  name text not null,
  score int not null default 0
);

create table if not exists room_snapshots (
  room_code text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists dm_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.-]{3,32}$'),
  display_name text not null,
  color text not null default '#b7394b',
  avatar_url text,
  avatar_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists dm_rooms (
  id text primary key,
  room_code text unique not null,
  name text not null,
  dm_user_id uuid not null,
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
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dm_rooms_dm_user_updated_idx
  on dm_rooms (dm_user_id, updated_at desc);

create index if not exists public_library_items_kind_updated_idx
  on public_library_items (kind, updated_at desc);

create index if not exists public_library_items_created_by_idx
  on public_library_items (created_by)
  where created_by is not null;

alter table rooms enable row level security;
alter table room_members enable row level security;
alter table tokens enable row level security;
alter table drawings enable row level security;
alter table dice_rolls enable row level security;
alter table initiative_entries enable row level security;
alter table room_snapshots enable row level security;
alter table dm_profiles enable row level security;
alter table dm_rooms enable row level security;
alter table public_library_items enable row level security;

create policy "room snapshots are readable"
  on room_snapshots for select
  using (true);

create policy "room snapshots can be created"
  on room_snapshots for insert
  with check (true);

create policy "room snapshots can be updated"
  on room_snapshots for update
  using (true)
  with check (true);

create policy "dm profiles are owned by account"
  on dm_profiles for select
  using (auth.uid() = user_id);

create policy "dm profiles can be created by owner"
  on dm_profiles for insert
  with check (auth.uid() = user_id);

create policy "dm profiles can be updated by owner"
  on dm_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dm rooms are owned by account"
  on dm_rooms for select
  using (auth.uid() = dm_user_id);

create policy "dm rooms can be created by owner"
  on dm_rooms for insert
  with check (auth.uid() = dm_user_id);

create policy "dm rooms can be updated by owner"
  on dm_rooms for update
  using (auth.uid() = dm_user_id)
  with check (auth.uid() = dm_user_id);

create policy "public library is readable"
  on public_library_items for select
  using (true);

create policy "authenticated dms can add public library items"
  on public_library_items for insert
  with check (auth.role() = 'authenticated' and auth.uid() = created_by);

create policy "library creators can update items"
  on public_library_items for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- V1 guest auth note:
-- These policies should be tightened when anonymous guest IDs are signed server-side.
-- Until then, prefer local-only mode or a small API layer that validates room membership.
