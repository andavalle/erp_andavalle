-- Cierre y renovación de contratos de renta conservando la cadena física y la OR.

alter table public.contracts
  add column closed_by uuid references public.profiles(id) on delete restrict,
  add column closure_reason text,
  add column closure_exception boolean not null default false;

create or replace function private.sync_rental_operation_status(p_operation_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_balance numeric;v_next text;
begin
  if p_operation_id is null then return; end if;
  if exists(select 1 from public.rental_operations where id=p_operation_id and status='cancelled') then return; end if;
  select coalesce(sum(case when destination.location_type='customer' then movement.quantity else 0 end)-sum(case when origin.location_type='customer' then movement.quantity else 0 end),0)
  into v_balance
  from public.inventory_movements movement
  left join public.inventory_locations destination on destination.id=movement.to_location_id
  left join public.inventory_locations origin on origin.id=movement.from_location_id
  where movement.contract_chain_id in (select distinct contract_chain_id from public.contracts where rental_operation_id=p_operation_id);
  v_next:=case
    when exists(select 1 from public.contracts where rental_operation_id=p_operation_id and status='active') then 'active'
    when v_balance<>0 then 'pending_return'
    when exists(select 1 from public.contracts where rental_operation_id=p_operation_id and status in ('draft','pending_authorization','authorized')) then 'planned'
    else 'closed'
  end;
  update public.rental_operations set status=v_next where id=p_operation_id and status is distinct from v_next;
end;
$$;

create function private.contract_sync_rental_operation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.rental_operation_id is not null then perform private.sync_rental_operation_status(new.rental_operation_id); end if;
  if old.rental_operation_id is distinct from new.rental_operation_id and old.rental_operation_id is not null then perform private.sync_rental_operation_status(old.rental_operation_id); end if;
  return new;
end;
$$;

create trigger contracts_sync_rental_operation
after update of status,rental_operation_id on public.contracts
for each row execute function private.contract_sync_rental_operation();

create or replace function private.protect_contract_content()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status<>'draft' and coalesce(current_setting('andavalle.workflow_action',true),'')='' and (
    old.contract_chain_id is distinct from new.contract_chain_id or old.previous_contract_id is distinct from new.previous_contract_id
    or old.customer_id is distinct from new.customer_id or old.site_id is distinct from new.site_id
    or old.contract_type is distinct from new.contract_type or old.starts_on is distinct from new.starts_on
    or old.ends_on is distinct from new.ends_on or old.currency is distinct from new.currency
    or old.notes is distinct from new.notes or old.rental_operation_id is distinct from new.rental_operation_id
    or old.closed_by is distinct from new.closed_by or old.closure_reason is distinct from new.closure_reason
    or old.closure_exception is distinct from new.closure_exception
  ) then raise exception 'Un contrato enviado o autorizado no puede editarse directamente' using errcode='42501'; end if;
  return new;
end;
$$;

create or replace function public.renew_contract(p_contract_id uuid,p_starts_on date,p_ends_on date)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare v_old public.contracts;v_new_id uuid;v_line record;v_product public.products;v_base numeric;v_factor numeric;v_floor_multiplier numeric;v_unit numeric;v_days integer;
begin
  perform set_config('andavalle.workflow_action','renew_contract',true);
  select * into v_old from public.contracts where id=p_contract_id for update;
  if v_old.id is null or v_old.contract_type<>'rental' or v_old.status not in ('authorized','active') then raise exception 'Contrato no renovable'; end if;
  if not private.has_any_role(v_old.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso para renovar' using errcode='42501'; end if;
  if v_old.rental_operation_id is null then raise exception 'El contrato no pertenece a una OR'; end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on or p_ends_on-p_starts_on+1<5 then raise exception 'La renovación requiere una vigencia mínima de 5 días'; end if;
  if exists(select 1 from public.contracts where previous_contract_id=v_old.id and status<>'cancelled') then raise exception 'El contrato ya tiene una renovación en curso'; end if;
  insert into public.contracts(organization_id,previous_contract_id,customer_id,site_id,contract_type,starts_on,ends_on,currency,notes,created_by,rental_operation_id)
  values(v_old.organization_id,v_old.id,v_old.customer_id,v_old.site_id,'rental',p_starts_on,p_ends_on,v_old.currency,'Renovación de '||v_old.folio,(select auth.uid()),v_old.rental_operation_id)
  returning id into v_new_id;
  v_days:=p_ends_on-p_starts_on+1;
  for v_line in select * from public.contract_lines where contract_id=v_old.id order by line_no loop
    select * into v_product from public.products where id=v_line.product_id;
    if v_line.billing_unit='day' and v_product.item_type='inventory' then
      select amount into v_base from public.product_prices
      where organization_id=v_old.organization_id and product_id=v_line.product_id and quotation_type='rental' and active
        and valid_from<=p_starts_on and (valid_until is null or valid_until>=p_starts_on)
      order by valid_from desc limit 1;
      select rate_factor,floor_multiplier into v_factor,v_floor_multiplier from public.rental_rate_tiers
      where organization_id=v_old.organization_id and active and valid_from<=p_starts_on and (valid_until is null or valid_until>=p_starts_on)
        and min_days<=v_days and (max_days is null or max_days>=v_days)
      order by valid_from desc,min_days desc limit 1;
      if v_base is null or v_factor is null then raise exception 'No existe precio o factor vigente para renovar %',coalesce(v_line.sku_snapshot,v_line.product_id::text); end if;
      v_unit:=greatest(round(v_base*v_days*v_factor,2),round(v_base*v_floor_multiplier,2));
    else
      v_base:=v_line.base_unit_price;v_factor:=v_line.rate_factor;v_unit:=v_line.unit_price;
    end if;
    insert into public.contract_lines(organization_id,contract_id,line_no,product_id,quantity,unit_price,discount_percent,tax_rate,starts_on,ends_on,billing_unit,sku_snapshot,description_snapshot,base_unit_price,rate_factor)
    values(v_line.organization_id,v_new_id,v_line.line_no,v_line.product_id,v_line.quantity,v_unit,v_line.discount_percent,v_line.tax_rate,p_starts_on,p_ends_on,v_line.billing_unit,v_line.sku_snapshot,v_line.description_snapshot,v_base,v_factor);
  end loop;
  return v_new_id;
end;
$$;

create or replace function public.authorize_contract(p_contract_id uuid,p_justification text default null)
returns public.contracts
language plpgsql
security invoker
set search_path=''
as $$
declare v_contract public.contracts;v_previous public.contracts;v_balance numeric;v_status public.contract_status:='authorized';
begin
  perform set_config('andavalle.workflow_action','authorize_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede autorizar contratos' using errcode='42501'; end if;
  if v_contract.status<>'pending_authorization' then raise exception 'El contrato debe estar pendiente de autorización'; end if;
  if not exists(select 1 from public.contract_lines where contract_id=p_contract_id) then raise exception 'El contrato no tiene partidas'; end if;
  if v_contract.created_by=(select auth.uid()) and length(trim(coalesce(p_justification,'')))<10 then raise exception 'La autorización propia requiere una justificación de al menos 10 caracteres'; end if;
  if v_contract.previous_contract_id is not null then
    select * into v_previous from public.contracts where id=v_contract.previous_contract_id for update;
    if v_previous.id is null or v_previous.contract_type<>'rental' or v_previous.contract_chain_id<>v_contract.contract_chain_id or v_previous.status not in ('authorized','active') then raise exception 'El contrato anterior no puede transferir la renovación'; end if;
    select coalesce(sum(case when destination.location_type='customer' then movement.quantity else 0 end)-sum(case when origin.location_type='customer' then movement.quantity else 0 end),0)
    into v_balance from public.inventory_movements movement
    left join public.inventory_locations destination on destination.id=movement.to_location_id
    left join public.inventory_locations origin on origin.id=movement.from_location_id
    where movement.contract_chain_id=v_contract.contract_chain_id;
    if v_balance<>0 then v_status:='active'; end if;
    update public.contracts set status='closed',closed_at=now(),closed_by=(select auth.uid()),closure_reason='Sustituido por renovación '||v_contract.folio,closure_exception=false where id=v_previous.id;
  end if;
  update public.contracts set status=v_status,authorized_by=(select auth.uid()),authorized_at=now(),notes=case when created_by=(select auth.uid()) then concat_ws(E'\n',notes,'Autorización propia: '||trim(p_justification)) else notes end where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create or replace function public.close_contract(p_contract_id uuid,p_force boolean default false,p_reason text default null)
returns public.contracts
language plpgsql
security invoker
set search_path=''
as $$
declare v_contract public.contracts;v_customer_balance numeric;v_has_reservations boolean;
begin
  perform set_config('andavalle.workflow_action','close_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null or v_contract.status not in ('authorized','active') then raise exception 'Contrato no cerrable'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso para cerrar' using errcode='42501'; end if;
  if p_force and (not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[]) or length(trim(coalesce(p_reason,'')))<10) then raise exception 'El cierre excepcional requiere administración y un motivo de al menos 10 caracteres'; end if;
  if v_contract.contract_type='rental' then
    select coalesce(sum(case when destination.location_type='customer' then movement.quantity else 0 end)-sum(case when origin.location_type='customer' then movement.quantity else 0 end),0)
    into v_customer_balance from public.inventory_movements movement
    left join public.inventory_locations destination on destination.id=movement.to_location_id
    left join public.inventory_locations origin on origin.id=movement.from_location_id
    where movement.contract_chain_id=v_contract.contract_chain_id;
    select exists(
      select 1 from public.stock_reservations reservation
      join public.operation_request_lines request_line on request_line.id=reservation.request_line_id
      join public.operation_requests request on request.id=request_line.request_id
      join public.contracts contract on contract.id=request.contract_id
      where contract.contract_chain_id=v_contract.contract_chain_id and reservation.released_at is null and reservation.quantity>reservation.consumed_quantity
    ) into v_has_reservations;
    if v_has_reservations then raise exception 'La cadena conserva reservas pendientes'; end if;
    if v_customer_balance<>0 and not p_force then raise exception 'La cadena conserva saldo físico en obra'; end if;
  else
    if not exists(select 1 from public.operation_requests where contract_id=v_contract.id and request_type='SS')
       or exists(select 1 from public.operation_requests where contract_id=v_contract.id and request_type='SS' and status<>'completed') then raise exception 'Una venta sólo puede cerrarse cuando sus solicitudes de salida están completas'; end if;
  end if;
  update public.contracts set status='closed',closed_at=now(),closed_by=(select auth.uid()),closure_reason=nullif(trim(coalesce(p_reason,'')),''),closure_exception=p_force where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create view public.contract_lifecycle with (security_invoker=true) as
with chain_balance as (
  select movement.organization_id,movement.contract_chain_id,
    (coalesce(sum(case when destination.location_type='customer' then movement.quantity else 0 end),0)-coalesce(sum(case when origin.location_type='customer' then movement.quantity else 0 end),0))::numeric(14,3) as customer_balance
  from public.inventory_movements movement
  left join public.inventory_locations destination on destination.id=movement.to_location_id
  left join public.inventory_locations origin on origin.id=movement.from_location_id
  where movement.contract_chain_id is not null
  group by movement.organization_id,movement.contract_chain_id
), chain_reservations as (
  select contract.organization_id,contract.contract_chain_id,
    coalesce(sum(reservation.quantity-reservation.consumed_quantity) filter(where reservation.released_at is null),0)::numeric(14,3) as pending_reservations
  from public.contracts contract
  join public.operation_requests request on request.contract_id=contract.id
  join public.operation_request_lines request_line on request_line.request_id=request.id
  join public.stock_reservations reservation on reservation.request_line_id=request_line.id
  group by contract.organization_id,contract.contract_chain_id
)
select contract.organization_id,contract.id as contract_id,contract.contract_chain_id,
  coalesce(balance.customer_balance,0)::numeric(14,3) as customer_balance,
  coalesce(reservations.pending_reservations,0)::numeric(14,3) as pending_reservations,
  exists(select 1 from public.contracts child where child.previous_contract_id=contract.id and child.status<>'cancelled') as has_renewal,
  exists(select 1 from public.contracts parent where parent.id=contract.previous_contract_id) as is_renewal
from public.contracts contract
left join chain_balance balance on balance.organization_id=contract.organization_id and balance.contract_chain_id=contract.contract_chain_id
left join chain_reservations reservations on reservations.organization_id=contract.organization_id and reservations.contract_chain_id=contract.contract_chain_id;

revoke execute on function private.sync_rental_operation_status(uuid),private.contract_sync_rental_operation() from public,anon,authenticated;
revoke execute on function public.renew_contract(uuid,date,date),public.authorize_contract(uuid,text),public.close_contract(uuid,boolean,text) from public,anon;
grant execute on function public.renew_contract(uuid,date,date),public.authorize_contract(uuid,text),public.close_contract(uuid,boolean,text) to authenticated;
revoke all on public.contract_lifecycle from anon;
grant select on public.contract_lifecycle to authenticated;
