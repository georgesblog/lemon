-- Remove the REST RPC exposure of the platform's auto-RLS event-trigger function.
--
-- `public.rls_auto_enable()` is a SECURITY DEFINER *event-trigger* function
-- provided by the Supabase/Lovable platform (wired to the `ensure_rls` event
-- trigger, it enables RLS on any new public table). It is infrastructure, not
-- part of this app's schema, so it is not created by these migrations — it
-- already exists on the hosted project.
--
-- It only ever runs as an event trigger, never as a callable RPC, so revoke
-- EXECUTE from the client roles to clear security linters 0028/0029 (a
-- SECURITY DEFINER function should not sit on the public REST surface). The
-- event trigger keeps firing regardless.
--
-- NOTE: because the function is platform-injected, a from-scratch rebuild on a
-- vanilla (non-Lovable) Supabase project must create it before this runs, or
-- guard this statement. On the hosted project it is already present.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
