-- WALLET-RECONCILIATION-COVERAGE-SSOT-1
-- One authoritative latest reconciliation receipt per Wallet.
-- Recent history limits are presentation-only and must not define coverage.

CREATE OR REPLACE FUNCTION public.get_wallet_reconciliation_coverage()
RETURNS SETOF public.wallet_reconciliations
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (wr.wallet_id) wr.*
  FROM public.wallet_reconciliations AS wr
  WHERE wr.user_id = public.current_finance_scope_owner_user_id()
  ORDER BY wr.wallet_id, wr.reconciled_at DESC, wr.id DESC;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_reconciliation_coverage()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_reconciliation_coverage() TO authenticated;

COMMENT ON FUNCTION public.get_wallet_reconciliation_coverage() IS
  'Returns the latest reconciliation receipt per wallet for the active finance scope; uncapped coverage read model.';
