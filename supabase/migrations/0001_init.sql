-- Basket Score — initial schema.
--
-- Four tables (users, prices, baskets, basket_items) with Row-Level Security so
-- that, even though the app ships a public anon key, a user can only ever touch
-- their own rows. Auth is anonymous-first: every device silently gets an
-- auth.users row (role 'authenticated', is_anonymous = true), which can later be
-- upgraded to an email account without losing data.
--
-- Privacy model:
--   users, baskets, basket_items  → fully private to the owner (auth.uid()).
--   prices                        → crowd-sourced: any signed-in user may READ
--                                   all observations (this powers price
--                                   comparisons), but may only write/edit/delete
--                                   their own rows.

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- One row per auth user. Mirrors the on-device settings so preferences follow
-- the account. Auto-created by a trigger on sign-up (see below).
create table if not exists public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  default_store  text,
  preset         text not null default 'balanced',
  protein_target integer not null default 150 check (protein_target between 0 and 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Baskets (saved lists / templates) ────────────────────────────────────────
create table if not exists public.baskets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'My basket',
  is_template boolean not null default false,
  store       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists baskets_user_id_idx on public.baskets (user_id);

-- ── Basket items ─────────────────────────────────────────────────────────────
-- A denormalised snapshot of each item so a saved basket still scores correctly
-- even if the Open Food Facts record later changes. Nutrition is kept as JSON to
-- mirror the client's `nutriments` shape without a wide column list.
create table if not exists public.basket_items (
  id              uuid primary key default gen_random_uuid(),
  basket_id       uuid not null references public.baskets (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  barcode         text,
  name            text,
  brand           text,
  price           numeric(10, 2) check (price is null or price >= 0),
  pack_grams      numeric(10, 2) check (pack_grams is null or pack_grams >= 0),
  is_dairy        boolean not null default false,
  nutriscore_grade text,
  nova_group      integer,
  category_tag    text,
  nutriments      jsonb not null default '{}'::jsonb,
  extra           jsonb not null default '{}'::jsonb,
  position        integer not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists basket_items_basket_id_idx on public.basket_items (basket_id);
create index if not exists basket_items_user_id_idx on public.basket_items (user_id);

-- ── Prices (crowd-sourced observations) ──────────────────────────────────────
create table if not exists public.prices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  barcode     text not null,
  price       numeric(10, 2) not null check (price > 0),
  currency    text not null default 'GBP',
  store       text,
  observed_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists prices_barcode_idx on public.prices (barcode);
create index if not exists prices_user_id_idx on public.prices (user_id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.users        enable row level security;
alter table public.baskets      enable row level security;
alter table public.basket_items enable row level security;
alter table public.prices       enable row level security;

-- Profiles: private to the owner.
create policy "users_own" on public.users
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Baskets: private to the owner.
create policy "baskets_own" on public.baskets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Basket items: private to the owner. (Ownership is enforced directly via
-- user_id so the check never depends on a second lookup.)
create policy "basket_items_own" on public.basket_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Prices: any signed-in user can read every observation; writes are own-only.
create policy "prices_read_all" on public.prices
  for select to authenticated
  using (true);
create policy "prices_insert_own" on public.prices
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy "prices_update_own" on public.prices
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "prices_delete_own" on public.prices
  for delete to authenticated
  using (auth.uid() = user_id);

-- ── Auto-create a profile row on sign-up ─────────────────────────────────────
-- Runs as SECURITY DEFINER with an empty search_path (Supabase security
-- guidance) so every new auth user — anonymous or email — gets a users row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Keep updated_at fresh ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists baskets_set_updated_at on public.baskets;
create trigger baskets_set_updated_at
  before update on public.baskets
  for each row execute function public.set_updated_at();
