-- Public share links — read-only leaderboards of a chosen shelf.
--
-- A shared board is a *snapshot* the owner chooses to publish: buckets → top-N
-- items with only product/score/price fields (name, brand, score, £/100g
-- protein, price, image URL). No identity, no auth id, no full basket — just the
-- comparison you wanted to show someone.
--
-- Security model (this is a public repo shipping an anon key):
--   • The table is owner-only under RLS. You can create, read back and revoke
--     your own boards; there is deliberately NO policy granting anon (or any
--     other user) SELECT, so the table can never be listed or dumped. That kills
--     enumeration — you cannot discover other people's shares.
--   • Public viewing goes through a SECURITY DEFINER RPC, get_shared_board(token),
--     granted to anon. It returns only the single row whose token exactly matches
--     (and hasn't expired) — never a list. A link works only if you already hold
--     its unguessable token.
--   • Revoke = delete the row (the link dies). Optional expiry via expires_at.

create table if not exists public.shared_boards (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text,
  snapshot   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists shared_boards_user_id_idx on public.shared_boards (user_id);

alter table public.shared_boards enable row level security;

-- Owner-only: create / read-back / revoke your own boards. No anon SELECT — the
-- only public path in is the token RPC below.
drop policy if exists "shared_boards_own" on public.shared_boards;
create policy "shared_boards_own" on public.shared_boards
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public read of a single board by its unguessable token. SECURITY DEFINER so it
-- bypasses RLS, but it only ever returns the one row matching the exact token and
-- not past expiry — never a list. Empty search_path per Supabase guidance.
create or replace function public.get_shared_board(board_token uuid)
returns table (token uuid, title text, snapshot jsonb, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select b.token, b.title, b.snapshot, b.created_at
  from public.shared_boards b
  where b.token = board_token
    and (b.expires_at is null or b.expires_at > now())
$$;

-- Lock the function down, then hand it only to the roles that should call it.
revoke all on function public.get_shared_board(uuid) from public;
grant execute on function public.get_shared_board(uuid) to anon, authenticated;
