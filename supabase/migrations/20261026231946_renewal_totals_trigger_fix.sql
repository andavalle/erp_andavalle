-- Cambios de custodia trasladada no modifican importes del contrato.
create or replace function private.recalculate_contract_totals()
returns trigger language plpgsql set search_path='' as $$
declare v_contract_id uuid:=coalesce((to_jsonb(new)->>'contract_id')::uuid,(to_jsonb(old)->>'contract_id')::uuid);
begin
  if tg_op='UPDATE'
     and old.contract_id is not distinct from new.contract_id
     and old.quantity is not distinct from new.quantity
     and old.unit_price is not distinct from new.unit_price
     and old.discount_percent is not distinct from new.discount_percent
     and old.tax_rate is not distinct from new.tax_rate then
    return new;
  end if;
  update public.contracts contract
  set subtotal=totals.subtotal,discount_amount=totals.discount_amount,tax_amount=totals.tax_amount,
      total=totals.subtotal-totals.discount_amount+totals.tax_amount
  from(
    select round(coalesce(sum(quantity*unit_price),0),2) as subtotal,
      round(coalesce(sum(quantity*unit_price*discount_percent/100),0),2) as discount_amount,
      round(coalesce(sum((quantity*unit_price)*(1-discount_percent/100)*tax_rate),0),2) as tax_amount
    from public.contract_lines where contract_id=v_contract_id
  ) totals
  where contract.id=v_contract_id;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
