-- Baseball Prospect Scout - watchlist sync
--
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
--
-- The anon key that ships in public/index.html is public by design. Everything
-- that keeps your data yours is below: RLS is on, and every policy compares
-- auth.uid() to the row's user_id, so a signed-out caller holding the anon key
-- can read and write exactly nothing.

create table if not exists public.watchlist (
  user_id   uuid        not null references auth.users (id) on delete cascade,
  player_id bigint      not null,               -- MLBAM person id
  name      text        not null default '',
  kind      text        not null default 'hitter',
  added_at  timestamptz not null default now(),
  primary key (user_id, player_id)
);

alter table public.watchlist enable row level security;

-- Policies are split per command so each one states its own intent.
drop policy if exists watchlist_select_own on public.watchlist;
create policy watchlist_select_own on public.watchlist
  for select using (auth.uid() = user_id);

drop policy if exists watchlist_insert_own on public.watchlist;
create policy watchlist_insert_own on public.watchlist
  for insert with check (auth.uid() = user_id);

drop policy if exists watchlist_update_own on public.watchlist;
create policy watchlist_update_own on public.watchlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists watchlist_delete_own on public.watchlist;
create policy watchlist_delete_own on public.watchlist
  for delete using (auth.uid() = user_id);

-- Fast lookup of one user's list.
create index if not exists watchlist_user_idx on public.watchlist (user_id);
