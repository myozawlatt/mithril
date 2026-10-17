-- mithril: server tables for sync. Paste into the Supabase SQL editor and run once.
--
-- After running it:
--   1. Project Settings → Data API → Exposed schemas: add `mithril`.
--   2. Authentication → Sign In / Providers: turn off "Allow new users to sign up".
--      Accounts are added by hand (Authentication → Users → Add user, auto-confirm).
--
-- Rows mirror the app's IndexedDB tables 1:1 (see lib/db.ts). Timestamps are
-- epoch milliseconds set by the client; `synced_at` is set here and is what
-- clients pull by. Nothing is ever deleted by the app (soft deletes), so there
-- is no DELETE grant. Writes with an older or equal `updated_at` are ignored, so
-- the newest edit wins and re-sending a row is a no-op.

create schema if not exists mithril;
grant usage on schema mithril to authenticated;

create table mithril.labels (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  -- Normalised name (trimmed, spaces collapsed, lower-cased); unique per user.
  key          text not null,
  color        text not null,
  use_count    integer not null default 0,
  last_used_at bigint not null,
  created_at   bigint not null,
  updated_at   bigint not null,
  synced_at    timestamptz not null default now(),
  unique (user_id, key)
);

create table mithril.expenses (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Whole MMK.
  amount     bigint not null check (amount >= 0),
  note       text not null default '',
  -- No foreign key: labels and expenses sync independently.
  label_id   uuid not null,
  date       date not null,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now()
);

-- Synced settings. Today only `budget:YYYY-MM` (value: [{ id, name, amount }]).
create table mithril.prefs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at bigint not null,
  deleted_at bigint,
  synced_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create index labels_user_synced on mithril.labels (user_id, synced_at);
create index expenses_user_synced on mithril.expenses (user_id, synced_at);
create index prefs_user_synced on mithril.prefs (user_id, synced_at);

-- Newest edit wins; stamps the row for pulls. `updated_at` comes from the
-- device, so a stamp more than 5 minutes ahead of this server's clock (a phone
-- clock set ahead) is brought back to now, and a stored one from the future
-- doesn't block newer edits.
create function mithril.on_write() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  server_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  latest bigint := server_now + 300000;
begin
  if new.updated_at > latest then
    new.updated_at := server_now;
  end if;
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at and old.updated_at <= latest then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- This server's clock in epoch ms. Clients stamp edits by it (lib/clock.ts), so
-- a device clock that's off doesn't decide which edit wins.
create function mithril.server_time() returns bigint
language sql
volatile
set search_path = ''
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

revoke execute on function mithril.server_time() from public;
grant execute on function mithril.server_time() to authenticated;

create trigger labels_on_write before insert or update on mithril.labels
  for each row execute function mithril.on_write();
create trigger expenses_on_write before insert or update on mithril.expenses
  for each row execute function mithril.on_write();
create trigger prefs_on_write before insert or update on mithril.prefs
  for each row execute function mithril.on_write();

-- Each user sees and writes only their own rows.
alter table mithril.labels enable row level security;
alter table mithril.expenses enable row level security;
alter table mithril.prefs enable row level security;

create policy "own labels: read" on mithril.labels for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own labels: add" on mithril.labels for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own labels: change" on mithril.labels for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own expenses: read" on mithril.expenses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own expenses: add" on mithril.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own expenses: change" on mithril.expenses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own prefs: read" on mithril.prefs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own prefs: add" on mithril.prefs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own prefs: change" on mithril.prefs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on mithril.labels, mithril.expenses, mithril.prefs to authenticated;

-- scripts/seed-sample.mjs writes with the secret key (role service_role). It
-- skips RLS but still needs grants, because this isn't the `public` schema.
grant usage on schema mithril to service_role;
grant select, insert, update on mithril.labels, mithril.expenses, mithril.prefs to service_role;
