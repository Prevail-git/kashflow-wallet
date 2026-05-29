
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  is_merchant BOOLEAN NOT NULL DEFAULT false,
  public_key TEXT,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles select all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Wallets
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallets select own" ON public.wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Devices
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL DEFAULT 'Device',
  public_key TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devices select own or admin" ON public.devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "devices insert own" ON public.devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "devices update own" ON public.devices FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Transactions
CREATE TYPE public.tx_status AS ENUM ('pending', 'confirmed', 'failed', 'flagged');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_jti TEXT NOT NULL UNIQUE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  note TEXT,
  status tx_status NOT NULL DEFAULT 'pending',
  signed_token TEXT NOT NULL,
  signer_public_key TEXT,
  device_id UUID REFERENCES public.devices(id),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,
  failure_reason TEXT,
  submitted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_from ON public.transactions(from_user_id, created_at DESC);
CREATE INDEX idx_tx_to ON public.transactions(to_user_id, created_at DESC);
CREATE INDEX idx_tx_status ON public.transactions(status);

GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tx select participant or admin" ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR public.has_role(auth.uid(), 'admin'));

-- Fraud flags
CREATE TABLE public.fraud_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  flagged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fraud_flags TO authenticated;
GRANT ALL ON public.fraud_flags TO service_role;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud admin all" ON public.fraud_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "fraud user select own" ON public.fraud_flags FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Auto-provision profile + wallet + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.wallets (user_id, balance_cents) VALUES (NEW.id, 10000);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Settlement function: atomic balance update. Replay protection via UNIQUE(token_jti).
CREATE OR REPLACE FUNCTION public.settle_transaction(
  p_token_jti TEXT,
  p_from UUID,
  p_to UUID,
  p_amount BIGINT,
  p_note TEXT,
  p_signed_token TEXT,
  p_signer_public_key TEXT,
  p_device_id UUID,
  p_issued_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_submitter UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_tx_id UUID;
  v_status tx_status := 'confirmed';
  v_reason TEXT;
BEGIN
  -- Validate basics
  IF p_amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid amount'); END IF;
  IF p_from = p_to THEN RETURN jsonb_build_object('ok', false, 'error', 'cannot self-send'); END IF;
  IF p_expires_at < now() THEN
    v_status := 'failed'; v_reason := 'token expired';
  END IF;

  -- Insert tx (UNIQUE(token_jti) enforces replay protection)
  BEGIN
    INSERT INTO public.transactions
      (token_jti, from_user_id, to_user_id, amount_cents, note, status, signed_token,
       signer_public_key, device_id, issued_at, expires_at, settled_at, failure_reason, submitted_by)
    VALUES
      (p_token_jti, p_from, p_to, p_amount, p_note, v_status, p_signed_token,
       p_signer_public_key, p_device_id, p_issued_at, p_expires_at,
       CASE WHEN v_status='confirmed' THEN now() ELSE NULL END, v_reason, p_submitter)
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate token (replay blocked)');
  END;

  IF v_status = 'failed' THEN
    RETURN jsonb_build_object('ok', false, 'error', v_reason, 'tx_id', v_tx_id);
  END IF;

  -- Lock + debit sender
  SELECT balance_cents INTO v_balance FROM public.wallets WHERE user_id = p_from FOR UPDATE;
  IF v_balance IS NULL THEN
    UPDATE public.transactions SET status='failed', failure_reason='no sender wallet' WHERE id=v_tx_id;
    RETURN jsonb_build_object('ok', false, 'error', 'no sender wallet');
  END IF;
  IF v_balance < p_amount THEN
    UPDATE public.transactions SET status='failed', failure_reason='insufficient funds' WHERE id=v_tx_id;
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient funds');
  END IF;
  UPDATE public.wallets SET balance_cents = balance_cents - p_amount, updated_at=now() WHERE user_id=p_from;

  -- Credit receiver (auto-create wallet if missing)
  INSERT INTO public.wallets (user_id, balance_cents) VALUES (p_to, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents, updated_at=now();

  RETURN jsonb_build_object('ok', true, 'tx_id', v_tx_id);
END;
$$;
