-- Cortes físicos auditados. Nunca sobrescriben saldos: generan movimientos compensatorios.

create type public.inventory_count_status as enum ('draft','confirmed','reversed','cancelled');

create table public.inventory_counts(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null,
  folio text,
  status public.inventory_count_status not null default 'draft',
  counted_on date not null default current_date,
  reason text not null check(length(trim(reason))>=5),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,id),
  unique(organization_id,folio),
  foreign key(organization_id,warehouse_id) references public.warehouses(organization_id,id) on delete restrict
);

create table public.inventory_count_lines(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inventory_count_id uuid not null,
  line_no integer not null check(line_no>0),
  product_id uuid not null,
  location_id uuid not null,
  system_quantity numeric(14,3) not null,
  counted_quantity numeric(14,3) not null check(counted_quantity>=0),
  difference numeric(14,3) generated always as (counted_quantity-system_quantity) stored,
  unique(inventory_count_id,line_no),
  unique(inventory_count_id,product_id,location_id),
  unique(organization_id,id),
  foreign key(organization_id,inventory_count_id) references public.inventory_counts(organization_id,id) on delete restrict,
  foreign key(organization_id,product_id) references public.products(organization_id,id) on delete restrict,
  foreign key(organization_id,location_id) references public.inventory_locations(organization_id,id) on delete restrict
);

alter table public.inventory_movements
  add column inventory_count_id uuid,
  add foreign key(organization_id,inventory_count_id) references public.inventory_counts(organization_id,id) on delete restrict;

create index inventory_counts_org_status_idx on public.inventory_counts(organization_id,status,created_at desc);
create index inventory_count_lines_product_idx on public.inventory_count_lines(product_id,location_id);
create index movements_inventory_count_idx on public.inventory_movements(inventory_count_id) where inventory_count_id is not null;

create function private.prepare_inventory_count()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('andavalle.workflow_action',true),'')<>'create_inventory_count' then
    raise exception 'El corte físico sólo puede crearse mediante la operación autorizada' using errcode='42501';
  end if;
  if new.folio is null then new.folio:=private.next_folio(new.organization_id,'CF',new.counted_on); end if;
  return new;
end;
$$;

create function private.guard_inventory_count()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare v_action text:=coalesce(current_setting('andavalle.workflow_action',true),'');
begin
  if tg_op='DELETE' then raise exception 'Los cortes físicos no se eliminan; se cancelan o revierten' using errcode='42501'; end if;
  if v_action not in ('update_inventory_count','confirm_inventory_count','reverse_inventory_count','cancel_inventory_count') then
    raise exception 'El corte físico sólo puede modificarse mediante una operación autorizada' using errcode='42501';
  end if;
  if old.status in ('confirmed','reversed','cancelled') and v_action<>'reverse_inventory_count' then
    raise exception 'El corte físico ya es inmutable' using errcode='42501';
  end if;
  return new;
end;
$$;

create function private.guard_inventory_count_line()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare v_status public.inventory_count_status;v_action text:=coalesce(current_setting('andavalle.workflow_action',true),'');
begin
  if v_action not in ('create_inventory_count','update_inventory_count') then
    raise exception 'Las partidas sólo pueden modificarse mediante la operación autorizada' using errcode='42501';
  end if;
  select status into v_status from public.inventory_counts where id=coalesce(new.inventory_count_id,old.inventory_count_id) for update;
  if v_status<>'draft' then raise exception 'Las partidas de un corte confirmado son inmutables' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger inventory_counts_prepare before insert on public.inventory_counts for each row execute function private.prepare_inventory_count();
create trigger inventory_counts_guard before update or delete on public.inventory_counts for each row execute function private.guard_inventory_count();
create trigger inventory_count_lines_guard before insert or update or delete on public.inventory_count_lines for each row execute function private.guard_inventory_count_line();
create trigger inventory_counts_updated before update on public.inventory_counts for each row execute function private.set_updated_at();
create trigger inventory_counts_audit after insert or update or delete on public.inventory_counts for each row execute function private.audit_row_change();
create trigger inventory_count_lines_audit after insert or update or delete on public.inventory_count_lines for each row execute function private.audit_row_change();

create function private.replace_inventory_count_lines(p_inventory_count_id uuid,p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;v_item record;v_product public.products;v_location public.inventory_locations;v_system numeric;
begin
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null or v_count.status<>'draft' then raise exception 'Corte físico borrador no encontrado'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'Agrega al menos una partida al conteo'; end if;
  if exists(select 1 from (select value->>'product_id',value->>'location_id',count(*) from jsonb_array_elements(p_lines) group by value->>'product_id',value->>'location_id' having count(*)>1) duplicate) then raise exception 'No repitas el mismo SKU y ubicación'; end if;
  delete from public.inventory_count_lines where inventory_count_id=v_count.id;
  for v_item in select value,ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(v_item.value->>'product_id','') is null or nullif(v_item.value->>'location_id','') is null or nullif(v_item.value->>'counted_quantity','') is null or (v_item.value->>'counted_quantity')::numeric<0 then raise exception 'Cada partida requiere SKU, ubicación y conteo no negativo'; end if;
    select * into v_product from public.products where id=(v_item.value->>'product_id')::uuid and organization_id=v_count.organization_id and item_type='inventory' for share;
    if v_product.id is null then raise exception 'Producto de inventario no encontrado'; end if;
    select * into v_location from public.inventory_locations where id=(v_item.value->>'location_id')::uuid and organization_id=v_count.organization_id and warehouse_id=v_count.warehouse_id and location_type in ('available','inspection','maintenance','damaged','writeoff') and active for share;
    if v_location.id is null then raise exception 'La ubicación no pertenece al almacén o no admite conteo'; end if;
    select quantity into v_system from public.inventory_balances where organization_id=v_count.organization_id and product_id=v_product.id and location_id=v_location.id;
    insert into public.inventory_count_lines(organization_id,inventory_count_id,line_no,product_id,location_id,system_quantity,counted_quantity)
    values(v_count.organization_id,v_count.id,v_item.ordinality,v_product.id,v_location.id,coalesce(v_system,0),(v_item.value->>'counted_quantity')::numeric);
  end loop;
end;
$$;

create function public.create_inventory_count(p_warehouse_id uuid,p_counted_on date,p_reason text,p_notes text,p_lines jsonb)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_warehouse public.warehouses;v_count public.inventory_counts;
begin
  select * into v_warehouse from public.warehouses where id=p_warehouse_id and active for share;
  if v_warehouse.id is null then raise exception 'Almacén activo no encontrado'; end if;
  if not private.has_any_role(v_warehouse.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso para capturar el corte' using errcode='42501'; end if;
  if p_counted_on is null or p_counted_on>current_date then raise exception 'La fecha del conteo no puede ser futura'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo del corte'; end if;
  perform set_config('andavalle.workflow_action','create_inventory_count',true);
  insert into public.inventory_counts(organization_id,warehouse_id,counted_on,reason,notes,created_by)
  values(v_warehouse.organization_id,v_warehouse.id,p_counted_on,trim(p_reason),nullif(trim(coalesce(p_notes,'')),''),(select auth.uid())) returning * into v_count;
  perform private.replace_inventory_count_lines(v_count.id,p_lines);
  return v_count;
end;
$$;

create function public.update_inventory_count_draft(p_inventory_count_id uuid,p_counted_on date,p_reason text,p_notes text,p_lines jsonb)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;
begin
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null or v_count.status<>'draft' then raise exception 'Corte físico borrador no encontrado'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if p_counted_on is null or p_counted_on>current_date then raise exception 'La fecha del conteo no puede ser futura'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Indica el motivo del corte'; end if;
  perform set_config('andavalle.workflow_action','update_inventory_count',true);
  update public.inventory_counts set counted_on=p_counted_on,reason=trim(p_reason),notes=nullif(trim(coalesce(p_notes,'')),'') where id=v_count.id returning * into v_count;
  perform private.replace_inventory_count_lines(v_count.id,p_lines);
  return v_count;
end;
$$;

create function public.confirm_inventory_count(p_inventory_count_id uuid)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;v_line record;v_current numeric;v_delta numeric;
begin
  perform set_config('andavalle.workflow_action','confirm_inventory_count',true);
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null then raise exception 'Corte físico no encontrado'; end if;
  if v_count.status='confirmed' then return v_count; end if;
  if v_count.status<>'draft' then raise exception 'Corte físico no confirmable'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede confirmar el corte' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_count_lines where inventory_count_id=v_count.id) then raise exception 'El corte no tiene partidas'; end if;
  for v_line in select * from public.inventory_count_lines where inventory_count_id=v_count.id order by product_id,location_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_count.organization_id::text||v_line.product_id::text||v_line.location_id::text,0));
    select quantity into v_current from public.inventory_balances where organization_id=v_count.organization_id and product_id=v_line.product_id and location_id=v_line.location_id;
    v_current:=coalesce(v_current,0);
    if v_current<>v_line.system_quantity then raise exception 'El saldo cambió después de capturar el corte; actualiza el borrador antes de confirmar'; end if;
    v_delta:=v_line.counted_quantity-v_current;
    if v_delta>0 then
      insert into public.inventory_movements(organization_id,inventory_count_id,product_id,to_location_id,quantity,movement_kind,created_by)
      values(v_count.organization_id,v_count.id,v_line.product_id,v_line.location_id,v_delta,'physical_count',(select auth.uid()));
    elsif v_delta<0 then
      insert into public.inventory_movements(organization_id,inventory_count_id,product_id,from_location_id,quantity,movement_kind,created_by)
      values(v_count.organization_id,v_count.id,v_line.product_id,v_line.location_id,abs(v_delta),'physical_count',(select auth.uid()));
    end if;
  end loop;
  perform set_config('andavalle.workflow_action','confirm_inventory_count',true);
  update public.inventory_counts set status='confirmed',confirmed_by=(select auth.uid()),confirmed_at=now() where id=v_count.id returning * into v_count;
  return v_count;
end;
$$;

create function public.reverse_inventory_count(p_inventory_count_id uuid,p_reason text)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;v_movement public.inventory_movements;v_balance numeric;
begin
  perform set_config('andavalle.workflow_action','reverse_inventory_count',true);
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null or v_count.status<>'confirmed' then raise exception 'Corte físico no reversible'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede revertir el corte' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  for v_movement in select * from public.inventory_movements where inventory_count_id=v_count.id and reversal_of_id is null order by product_id,id loop
    perform pg_advisory_xact_lock(hashtextextended(v_count.organization_id::text||v_movement.product_id::text||coalesce(v_movement.to_location_id,v_movement.from_location_id)::text,0));
    if v_movement.to_location_id is not null then
      select quantity into v_balance from public.inventory_balances where organization_id=v_count.organization_id and product_id=v_movement.product_id and location_id=v_movement.to_location_id;
      if coalesce(v_balance,0)<v_movement.quantity then raise exception 'No se puede revertir: el inventario agregado ya fue consumido'; end if;
    end if;
    insert into public.inventory_movements(organization_id,inventory_count_id,product_id,from_location_id,to_location_id,quantity,movement_kind,reversal_of_id,created_by)
    values(v_movement.organization_id,v_count.id,v_movement.product_id,v_movement.to_location_id,v_movement.from_location_id,v_movement.quantity,'physical_count_reversal',v_movement.id,(select auth.uid()));
  end loop;
  perform set_config('andavalle.workflow_action','reverse_inventory_count',true);
  update public.inventory_counts set status='reversed',reversed_by=(select auth.uid()),reversed_at=now(),reversal_reason=trim(p_reason) where id=v_count.id returning * into v_count;
  return v_count;
end;
$$;

create function public.cancel_inventory_count(p_inventory_count_id uuid,p_reason text)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;
begin
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null or v_count.status<>'draft' then raise exception 'Sólo un corte borrador puede cancelarse'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  perform set_config('andavalle.workflow_action','cancel_inventory_count',true);
  update public.inventory_counts set status='cancelled',reversal_reason=trim(p_reason) where id=v_count.id returning * into v_count;
  return v_count;
end;
$$;

alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
create policy inventory_counts_org_read on public.inventory_counts for select to authenticated using((select private.user_in_organization(organization_id)));
create policy inventory_count_lines_org_read on public.inventory_count_lines for select to authenticated using((select private.user_in_organization(organization_id)));
create policy inventory_counts_write on public.inventory_counts for all to authenticated using((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));
create policy inventory_count_lines_write on public.inventory_count_lines for all to authenticated using((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));

grant select,insert,update,delete on public.inventory_counts,public.inventory_count_lines to authenticated;
revoke execute on function private.prepare_inventory_count(),private.guard_inventory_count(),private.guard_inventory_count_line(),private.replace_inventory_count_lines(uuid,jsonb) from public,anon;
grant execute on function private.replace_inventory_count_lines(uuid,jsonb) to authenticated;
revoke execute on function public.create_inventory_count(uuid,date,text,text,jsonb),public.update_inventory_count_draft(uuid,date,text,text,jsonb),public.confirm_inventory_count(uuid),public.reverse_inventory_count(uuid,text),public.cancel_inventory_count(uuid,text) from public,anon;
grant execute on function public.create_inventory_count(uuid,date,text,text,jsonb),public.update_inventory_count_draft(uuid,date,text,text,jsonb),public.confirm_inventory_count(uuid),public.reverse_inventory_count(uuid,text),public.cancel_inventory_count(uuid,text) to authenticated;

drop view public.inventory_trace;
create view public.inventory_trace with (security_invoker=true) as
select m.organization_id,m.id as movement_id,m.product_id,m.created_at,m.quantity,m.movement_kind,m.reversal_of_id,
  origin.name as from_location,origin.location_type as from_location_type,
  destination.name as to_location,destination.location_type as to_location_type,
  d.id as document_id,d.folio as document_folio,d.document_type,d.status as document_status,
  r.folio as request_folio,c.folio as contract_folio,
  coalesce(customer.trade_name,customer.legal_name) as customer_name,site.name as site_name,
  count_doc.folio as inventory_count_folio
from public.inventory_movements m
left join public.inventory_locations origin on origin.id=m.from_location_id
left join public.inventory_locations destination on destination.id=m.to_location_id
left join public.inventory_documents d on d.id=m.document_id
left join public.operation_requests r on r.id=d.request_id
left join public.contracts c on c.id=r.contract_id
left join public.customers customer on customer.id=c.customer_id
left join public.customer_sites site on site.id=c.site_id
left join public.inventory_counts count_doc on count_doc.id=m.inventory_count_id;
grant select on public.inventory_trace to authenticated;
