# Supabase setup

Basket Score is offline-first: it works entirely on `localStorage` with no
backend. Supabase adds **optional** cloud sync (anonymous auth + saved baskets +
crowd prices). This doc is the secure, local-CLI workflow for standing it up and
pushing schema changes — safe for a **public** repository.

## The security model (read this first)

| Value | Where it lives | In the public repo? |
| --- | --- | --- |
| Project URL | `.env.local` + Actions secret | ✅ safe (public by design) |
| `anon` / publishable key | `.env.local` + Actions secret | ✅ safe (public by design) |
| `service_role` key | **nowhere** in this project | ❌ never |
| DB password | your shell / dashboard only | ❌ never |
| Personal access token | `supabase login` keychain | ❌ never |

The anon key **is meant to ship in the client bundle** — anyone can read it in
the deployed JS. That is fine. The actual security boundary is **Row-Level
Security**: every table (`supabase/migrations/0001_init.sql`) is locked to
`auth.uid()`, so with the public key a user can only ever see or change their own
rows. `prices` is the one exception — it's readable by any signed-in user (that's
the point of shared prices) but writable only by its author.

`.gitignore` blocks every `.env*` file except `.env.example`, and
`supabase/.gitignore` blocks the CLI's local state, so no secret can be committed
by accident.

## One-time setup

1. **Install the Supabase CLI** (a system tool, not an npm dependency, so it
   never slows CI):
   ```bash
   brew install supabase/tap/supabase      # macOS/Linux
   # or: https://supabase.com/docs/guides/cli for other installers
   ```

2. **Add the public keys locally.** Copy the template and paste the two public
   values from Dashboard → Project Settings → API:
   ```bash
   cp .env.example .env.local
   # edit .env.local:
   #   VITE_SUPABASE_URL=https://<ref>.supabase.co
   #   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

3. **Enable anonymous sign-ins** (required — auth is anonymous-first):
   Dashboard → Authentication → Providers/Sign-in → toggle **Anonymous** on.

4. **Link the repo to the remote project** (prompts for the DB password; nothing
   is written to a tracked file):
   ```bash
   npm run db:link       # supabase link  → pick the "Lemon" project
   ```

## Push schema changes

Migrations are plain SQL in `supabase/migrations/`, applied in filename order.

```bash
npm run db:push          # apply pending migrations to the linked project
```

To add a change, never edit an applied migration — create a new one and push:

```bash
npm run db:new add_baskets_color   # writes supabase/migrations/<ts>_add_baskets_color.sql
# edit the file, then:
npm run db:push
```

Helpers: `npm run db:diff` (preview local-vs-remote schema drift) and
`npm run db:pull` (import remote changes made in the dashboard into a migration).

## Deploying with cloud sync on

The GitHub Pages build reads the same two public vars at build time. Add them as
repo secrets (Settings → Secrets and variables → Actions):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`deploy.yml` passes them into the build; if they're unset the deployed app simply
stays in offline-only mode. No other secret is ever needed by CI.
