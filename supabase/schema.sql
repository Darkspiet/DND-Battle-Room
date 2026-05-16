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

alter table rooms enable row level security;
alter table room_members enable row level security;
alter table tokens enable row level security;
alter table drawings enable row level security;
alter table dice_rolls enable row level security;
alter table initiative_entries enable row level security;
alter table room_snapshots enable row level security;

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

-- V1 guest auth note:
-- These policies should be tightened when anonymous guest IDs are signed server-side.
-- Until then, prefer local-only mode or a small API layer that validates room membership.
