
DROP VIEW IF EXISTS public.public_profiles;

DROP POLICY IF EXISTS "profiles select own or admin" ON public.profiles;
CREATE POLICY "profiles select all authenticated" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, is_merchant, public_key, created_at, updated_at)
  ON public.profiles TO authenticated;
