-- Harden the helper functions from 0001 (Supabase security linter follow-ups).
--
-- 1. Pin an empty search_path on set_updated_at so a SECURITY-sensitive trigger
--    can't be hijacked via a mutable search_path (linter 0011).
-- 2. handle_new_user is a trigger-only SECURITY DEFINER function; it never needs
--    to be reachable over the REST RPC surface, so revoke EXECUTE from every
--    client role. The trigger still fires on sign-up — revoking EXECUTE only
--    removes the /rest/v1/rpc entry point, not the trigger.

alter function public.set_updated_at() set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
