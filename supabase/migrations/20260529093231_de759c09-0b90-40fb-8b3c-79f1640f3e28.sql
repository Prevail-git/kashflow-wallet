
REVOKE EXECUTE ON FUNCTION public.settle_transaction(TEXT, UUID, UUID, BIGINT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
