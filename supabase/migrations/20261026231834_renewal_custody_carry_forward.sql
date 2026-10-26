-- La renovación hereda custodia contable por SKU sin generar movimientos físicos.

alter table public.contract_lines
  add column carried_quantity numeric(14,3) not null default 0 check(carried_quantity>=0);

create or replace function private.contract_lines_draft_only()
returns trigger language plpgsql set search_path='' as $$
declare v_status public.contract_status;v_action text:=coalesce(current_setting('andavalle.workflow_action',true),'');
begin
  select status into v_status from public.contracts where id=coalesce(new.contract_id,old.contract_id);
  if v_status<>'draft' and v_action<>'authorize_contract' then raise exception 'Las partidas sólo pueden editarse mientras el contrato está en borrador' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create function private.carry_forward_renewal_custody()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare v_line public.contract_lines;v_balance numeric;v_used numeric;
begin
  if old.status='pending_authorization' and new.status in ('authorized','active') and new.previous_contract_id is not null and new.contract_type='rental' then
    for v_line in select * from public.contract_lines where contract_id=new.id order by product_id,line_no loop
      select coalesce(sum(case when destination.location_type='customer' then movement.quantity else 0 end)-sum(case when origin.location_type='customer' then movement.quantity else 0 end),0)
      into v_balance from public.inventory_movements movement
      left join public.inventory_locations destination on destination.id=movement.to_location_id
      left join public.inventory_locations origin on origin.id=movement.from_location_id
      where movement.contract_chain_id=new.contract_chain_id and movement.product_id=v_line.product_id;
      select coalesce(sum(carried_quantity),0) into v_used from public.contract_lines where contract_id=new.id and product_id=v_line.product_id and line_no<v_line.line_no;
      update public.contract_lines set carried_quantity=least(quantity,greatest(v_balance-v_used,0)) where id=v_line.id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger contracts_carry_forward_renewal_custody
before update of status on public.contracts
for each row execute function private.carry_forward_renewal_custody();

create or replace view public.contract_line_custody with (security_invoker=true) as
select cl.organization_id,cl.contract_id,cl.id as contract_line_id,cl.product_id,
  (cl.carried_quantity+coalesce(document_totals.delivered,0))::numeric(14,3) as delivered,
  coalesce(document_totals.returned,0)::numeric(14,3) as returned,
  (cl.carried_quantity+coalesce(document_totals.delivered,0)-coalesce(document_totals.returned,0))::numeric(14,3) as in_custody
from public.contract_lines cl
left join lateral(
  select
    coalesce(sum(document_line.quantity) filter(where document.document_type='HS' and document.status='confirmed'),0) as delivered,
    coalesce(sum(document_line.quantity) filter(where document.document_type='HE' and document.status='confirmed'),0) as returned
  from public.operation_request_lines request_line
  join public.inventory_document_lines document_line on document_line.request_line_id=request_line.id
  join public.inventory_documents document on document.id=document_line.document_id
  where request_line.contract_line_id=cl.id
) document_totals on true;

grant select on public.contract_line_custody to authenticated;
revoke execute on function private.carry_forward_renewal_custody() from public,anon,authenticated;
