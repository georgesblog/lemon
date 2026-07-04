// Supabase client — optional cloud sync layered on top of the offline-first app.
//
// Basket Score works fully with no backend (basket + settings live in
// localStorage). Supabase is *additive*: when the two public env vars are set
// we get anonymous auth + per-user cloud data; when they're absent — a fork
// with no secrets, or a build that hasn't been configured — `supabase` is null
// and the app just carries on locally. Nothing here ever blocks the core flow.
//
// SECURITY: only the URL and the anon/publishable key belong here. Those are
// designed to ship in a public client bundle — the real security boundary is
// Row-Level Security in the database (see supabase/migrations), which ties
// every row to auth.uid(). The service_role key / DB password must NEVER reach
// this file or the repo.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

// True when cloud sync is wired up (env present). The UI uses this to decide
// whether to show "save to cloud" affordances at all.
export const isCloudEnabled = () => supabase != null

// Sign the device in anonymously (no email) so RLS has an auth.uid() to key on.
// Idempotent and cached: an existing session is reused, and a later email link
// can upgrade this same account to sync across devices. Resolves to the session
// or null (cloud disabled / sign-in failed — the caller falls back to local).
let sessionPromise = null
export function ensureSession() {
  if (!supabase) return Promise.resolve(null)
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) return session
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        sessionPromise = null // let a later call retry
        return null
      }
      return data.session
    })()
  }
  return sessionPromise
}
