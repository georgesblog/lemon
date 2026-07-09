-- Store catalog — a private, per-user reference list of products on a shop's
-- shelves (name, price, size, nutrition) so you can ask "which <category> should
-- I buy at <store>?" without scanning it yourself.
--
-- Privacy model (this is a public repo shipping an anon key):
--   • Owner-only under RLS — you can only ever see or change your own rows.
--   • There is deliberately NO shared/anon read policy. Catalog data seeded from
--     a third-party site (e.g. a personal Waitrose import) therefore stays
--     private to the importer's account and is never republished through the app.
--   • Rows are written by a local, personal-use importer using the service_role
--     key (which bypasses RLS); it sets user_id explicitly to the owner.

create table if not exists public.catalog_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  store       text not null,                 -- e.g. 'Waitrose'
  category    text not null,                 -- e.g. 'sandwiches'
  name        text not null,
  brand       text,
  url         text,                          -- source product page
  barcode     text,
  price       numeric(10, 2) check (price is null or price >= 0),
  pack_grams  numeric(10, 2) check (pack_grams is null or pack_grams >= 0),
  nutriments  jsonb not null default '{}'::jsonb,
  extra       jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Re-imports upsert on this key so prices refresh in place rather than pile up.
  unique (user_id, store, name)
);
create index if not exists catalog_items_scope_idx
  on public.catalog_items (user_id, store, category);

alter table public.catalog_items enable row level security;

drop policy if exists "catalog_items_own" on public.catalog_items;
create policy "catalog_items_own" on public.catalog_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
