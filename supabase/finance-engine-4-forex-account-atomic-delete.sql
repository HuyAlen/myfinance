-- INVESTMENTS-CORRECTNESS-1
-- Atomic deletion of a Forex account and its linked cash ledger.
--
-- Why this exists:
-- The old client deleted linked forex_cash_transactions one-by-one and only
-- then deleted forex_accounts. If one middle RPC failed, earlier deletions had
-- already committed and wallet balances/history were left partially reversed.
--
-- This wrapper keeps the existing, authoritative
-- delete_forex_cash_transaction() semantics for each cash movement, but invokes
-- every deletion inside ONE outer PostgreSQL function call. PostgreSQL treats
-- the RPC as one transaction: any error rolls back every nested ledger delete,
-- wallet reversal, and the final account delete together.

create or replace function public.delete_forex_account_atomic(
  p_account_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transaction record;
begin
  -- Lock and authorize the account first. RLS remains an independent backstop,
  -- while the explicit user predicate prevents cross-user deletion even if
  -- policies drift later.
  perform 1
  from public.forex_accounts
  where id = p_account_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception using
      errcode = 'MFX01',
      message = 'Không tìm thấy tài khoản Forex.';
  end if;

  -- Lock the exact linked ledger set before mutating it. Each nested function
  -- reverses its own wallet effect using the same production logic already used
  -- by single-transaction deletion. A failure here aborts the OUTER RPC too.
  for v_transaction in
    select id
    from public.forex_cash_transactions
    where forex_account_id = p_account_id
      and user_id = auth.uid()
    order by created_at, id
    for update
  loop
    perform public.delete_forex_cash_transaction(p_id => v_transaction.id);
  end loop;

  delete from public.forex_accounts
  where id = p_account_id
    and user_id = auth.uid();

  if not found then
    raise exception using
      errcode = 'MFX01',
      message = 'Không tìm thấy tài khoản Forex.';
  end if;
end;
$$;

revoke all on function public.delete_forex_account_atomic(uuid) from public;
grant execute on function public.delete_forex_account_atomic(uuid) to authenticated;
