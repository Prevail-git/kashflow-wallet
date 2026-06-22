
-- 1) has_role: switch to SECURITY INVOKER to remove SECURITY DEFINER linter findings.
--    Requires user_roles SELECT policy to not recursively call has_role.
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2) user_roles: prevent privilege escalation. Only admins may write.
CREATE POLICY "admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
-- Defense in depth at GRANT level
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- 3) profiles: restrict SELECT to owner or admin; expose safe columns via view.
DROP POLICY IF EXISTS "profiles select all authenticated" ON public.profiles;
CREATE POLICY "profiles select own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE VIEW public.public_profiles
  WITH (security_barrier = true) AS
  SELECT id, display_name, is_merchant, public_key
  FROM public.profiles;
GRANT SELECT ON public.public_profiles TO authenticated;

-- 4) profiles: column-level UPDATE so users cannot flip is_suspended / is_merchant.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, phone, public_key) ON public.profiles TO authenticated;

-- 5) Atomic top-up RPC with row lock and daily cap.
CREATE OR REPLACE FUNCTION public.topup_wallet(p_user uuid, p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used bigint;
  v_balance bigint;
  v_now timestamptz := now();
  v_jti text;
BEGIN
  IF p_amount <= 0 OR p_amount > 20000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid amount');
  END IF;

  -- Ensure wallet row exists and lock it
  INSERT INTO public.wallets (user_id, balance_cents) VALUES (p_user, 0)
    ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.wallets WHERE user_id = p_user FOR UPDATE;

  -- Sum confirmed self->self top-ups in the last 24h (with row locks to serialise)
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_used
  FROM public.transactions
  WHERE from_user_id = p_user
    AND to_user_id = p_user
    AND status = 'confirmed'
    AND created_at >= v_now - INTERVAL '24 hours'
  FOR UPDATE;

  IF v_used + p_amount > 50000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Daily top-up limit reached ($500)');
  END IF;

  UPDATE public.wallets
    SET balance_cents = balance_cents + p_amount,
        updated_at = v_now
    WHERE user_id = p_user
    RETURNING balance_cents INTO v_balance;

  v_jti := 'topup-' || gen_random_uuid()::text;
  INSERT INTO public.transactions
    (token_jti, from_user_id, to_user_id, amount_cents, note, status,
     signed_token, issued_at, expires_at, settled_at, submitted_by)
  VALUES
    (v_jti, p_user, p_user, p_amount, 'Top-up', 'confirmed',
     'topup', v_now, v_now + INTERVAL '1 minute', v_now, p_user);

  RETURN jsonb_build_object('ok', true, 'balance_cents', v_balance);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.topup_wallet(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.topup_wallet(uuid, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_wallet(uuid, bigint) TO service_role;

-- 6) Reliable email -> user_id lookup (no 200-user pagination cap).
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;

-- 7) Admin check RPC used by the admin route loader gate.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::public.app_role
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;
