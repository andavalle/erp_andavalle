create or replace function private.user_in_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_organization_id
      and m.profile_id = (select auth.uid())
      and m.active and p.active
  );
$$;

create or replace function private.has_any_role(p_organization_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_in_organization(p_organization_id) and exists (
    select 1 from public.organization_member_roles r
    where r.organization_id = p_organization_id
      and r.profile_id = (select auth.uid())
      and r.role_code = any(p_roles)
  );
$$;

create or replace function private.next_folio(p_organization_id uuid, p_document_code text, p_date date default current_date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_year integer := extract(year from p_date); v_value bigint;
begin
  if (select auth.uid()) is not null and not private.user_in_organization(p_organization_id) then
    raise exception 'No pertenece a la organización' using errcode = '42501';
  end if;
  insert into public.document_sequences(organization_id, document_code, sequence_year, last_value)
  values (p_organization_id, p_document_code, v_year, 1)
  on conflict (organization_id, document_code, sequence_year)
  do update set last_value = public.document_sequences.last_value + 1
  returning last_value into v_value;
  return p_document_code || '-' || v_year::text || '-' || lpad(v_value::text, 6, '0');
end;
$$;

create or replace function private.prepare_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_chain uuid;
begin
  if new.previous_contract_id is not null then
    select contract_chain_id into v_chain from public.contracts
    where id = new.previous_contract_id and organization_id = new.organization_id;
    if v_chain is null then raise exception 'Contrato anterior inválido'; end if;
    new.contract_chain_id := v_chain;
  elsif new.contract_chain_id is null then
    insert into public.contract_chains(organization_id) values (new.organization_id) returning id into new.contract_chain_id;
  end if;
  if new.folio is null then
    new.folio := private.next_folio(new.organization_id, case new.contract_type when 'rental' then 'CTR-R' else 'CTR-V' end, new.starts_on);
  end if;
  return new;
end;
$$;

create trigger contracts_prepare before insert on public.contracts
for each row execute function private.prepare_contract();

create or replace function private.prepare_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type public.contract_type;
begin
  select contract_type into v_type from public.contracts where id = new.contract_id and organization_id = new.organization_id;
  if v_type is null then raise exception 'Contrato inválido'; end if;
  if new.request_type = 'SE' and v_type <> 'rental' then raise exception 'Una venta no admite solicitud de entrada'; end if;
  if new.folio is null then new.folio := private.next_folio(new.organization_id, new.request_type::text, new.requested_at::date); end if;
  return new;
end;
$$;

create trigger requests_prepare before insert on public.operation_requests
for each row execute function private.prepare_request();

create or replace function private.prepare_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request_type public.request_type;
begin
  select request_type into v_request_type from public.operation_requests where id = new.request_id and organization_id = new.organization_id;
  if v_request_type is null then raise exception 'Solicitud inválida'; end if;
  if (v_request_type = 'SS' and new.document_type <> 'HS') or (v_request_type = 'SE' and new.document_type <> 'HE') then
    raise exception 'El tipo de documento no corresponde a la solicitud';
  end if;
  if new.folio is null then new.folio := private.next_folio(new.organization_id, new.document_type::text, current_date); end if;
  return new;
end;
$$;

create trigger documents_prepare before insert on public.inventory_documents
for each row execute function private.prepare_document();

create or replace function private.protect_workflow_state()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(old)->>'status') is distinct from (to_jsonb(new)->>'status') and coalesce(current_setting('andavalle.workflow_action',true),'')='' then
    raise exception 'El estado sólo puede cambiar mediante una operación del flujo' using errcode='42501';
  end if;
  if tg_table_name='inventory_documents' and (to_jsonb(old)->>'status') in ('confirmed','reversed') and coalesce(current_setting('andavalle.workflow_action',true),'')='' then
    raise exception 'Un documento confirmado es inmutable' using errcode='42501';
  end if;
  return new;
end;
$$;

create trigger contracts_protect_state before update on public.contracts for each row execute function private.protect_workflow_state();
create trigger requests_protect_state before update on public.operation_requests for each row execute function private.protect_workflow_state();
create trigger documents_protect_state before update on public.inventory_documents for each row execute function private.protect_workflow_state();

create or replace function private.guard_child_edit()
returns trigger language plpgsql set search_path = '' as $$
declare v_parent_status text;
begin
  if tg_op='UPDATE' and (
    (tg_table_name='contract_lines' and (to_jsonb(old)->>'contract_id') is distinct from (to_jsonb(new)->>'contract_id'))
    or (tg_table_name='operation_request_lines' and (to_jsonb(old)->>'request_id') is distinct from (to_jsonb(new)->>'request_id'))
    or (tg_table_name='inventory_document_lines' and (to_jsonb(old)->>'document_id') is distinct from (to_jsonb(new)->>'document_id'))
  ) then
    raise exception 'No se permite mover una partida a otro documento' using errcode='42501';
  end if;
  if tg_table_name='contract_lines' then
    select status::text into v_parent_status from public.contracts
    where id=coalesce(new.contract_id,old.contract_id) for update;
    if v_parent_status not in ('draft','pending_authorization') then
      raise exception 'Las partidas de un contrato autorizado son inmutables' using errcode='42501';
    end if;
  elsif tg_table_name='operation_request_lines' then
    select status::text into v_parent_status from public.operation_requests
    where id=coalesce(new.request_id,old.request_id) for update;
    if v_parent_status not in ('draft','submitted') then
      raise exception 'Las partidas de una solicitud autorizada son inmutables' using errcode='42501';
    end if;
  elsif tg_table_name='inventory_document_lines' then
    select status::text into v_parent_status from public.inventory_documents
    where id=coalesce(new.document_id,old.document_id) for update;
    if v_parent_status<>'draft' then
      raise exception 'Las partidas de un documento confirmado son inmutables' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger contract_lines_guard before insert or update or delete on public.contract_lines
for each row execute function private.guard_child_edit();
create trigger request_lines_guard before insert or update or delete on public.operation_request_lines
for each row execute function private.guard_child_edit();
create trigger document_lines_guard before insert or update or delete on public.inventory_document_lines
for each row execute function private.guard_child_edit();

create or replace function private.recalculate_contract_totals()
returns trigger language plpgsql set search_path = '' as $$
declare v_contract_id uuid := coalesce((to_jsonb(new)->>'contract_id')::uuid,(to_jsonb(old)->>'contract_id')::uuid);
begin
  update public.contracts c
  set subtotal=x.subtotal,
      discount_amount=x.discount_amount,
      tax_amount=x.tax_amount,
      total=x.subtotal-x.discount_amount+x.tax_amount
  from (
    select round(coalesce(sum(quantity*unit_price),0),2) as subtotal,
           round(coalesce(sum(quantity*unit_price*discount_percent/100),0),2) as discount_amount,
           round(coalesce(sum((quantity*unit_price)*(1-discount_percent/100)*tax_rate),0),2) as tax_amount
    from public.contract_lines where contract_id=v_contract_id
  ) x
  where c.id=v_contract_id;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger contract_lines_recalculate after insert or update or delete on public.contract_lines
for each row execute function private.recalculate_contract_totals();

create or replace function private.require_workflow_write()
returns trigger language plpgsql set search_path='' as $$
begin
  if (select auth.uid()) is not null and coalesce(current_setting('andavalle.workflow_action',true),'')='' then
    raise exception 'Esta tabla sólo puede cambiar mediante una operación del flujo' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger reservations_workflow_only before insert or update or delete on public.stock_reservations
for each row execute function private.require_workflow_write();
create trigger movements_workflow_only before insert on public.inventory_movements
for each row execute function private.require_workflow_write();

create or replace function private.protect_movement_history()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Los movimientos son inmutables' using errcode='42501'; end;
$$;
create trigger movements_immutable before update or delete on public.inventory_movements for each row execute function private.protect_movement_history();

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(coalesce(new.email,'Usuario'),'@',1)))
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile_created after insert on auth.users
for each row execute function private.handle_new_user();

create trigger profiles_updated before update on public.profiles for each row execute function private.set_updated_at();
create trigger customers_updated before update on public.customers for each row execute function private.set_updated_at();
create trigger leads_updated before update on public.crm_leads for each row execute function private.set_updated_at();
create trigger products_updated before update on public.products for each row execute function private.set_updated_at();
create trigger contracts_updated before update on public.contracts for each row execute function private.set_updated_at();
create trigger requests_updated before update on public.operation_requests for each row execute function private.set_updated_at();
create trigger logistics_updated before update on public.logistics_assignments for each row execute function private.set_updated_at();

create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_entity uuid;
begin
  v_org := coalesce((to_jsonb(new)->>'organization_id')::uuid, (to_jsonb(old)->>'organization_id')::uuid);
  v_entity := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
  insert into public.audit_events(organization_id, actor_id, action, entity_type, entity_id, old_data, new_data)
  values (v_org, (select auth.uid()), tg_op, tg_table_name, v_entity,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['customers','customer_sites','crm_leads','customer_activities','products','contracts','contract_lines','operation_requests','operation_request_lines','logistics_assignments','inventory_documents','inventory_document_lines','stock_reservations','inventory_movements','document_files']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t, t);
  end loop;
end $$;

create or replace function public.authorize_contract(p_contract_id uuid)
returns public.contracts
language plpgsql
security invoker
set search_path = ''
as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','authorize_contract',true);
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id, array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_contract.status not in ('draft','pending_authorization') then raise exception 'Estado de contrato no autorizable'; end if;
  if not exists (select 1 from public.contract_lines where contract_id = p_contract_id) then raise exception 'El contrato no tiene partidas'; end if;
  update public.contracts set status='authorized', authorized_by=(select auth.uid()), authorized_at=now()
  where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create or replace function public.submit_contract(p_contract_id uuid)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','submit_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_contract.status<>'draft' then raise exception 'Sólo un contrato en borrador puede enviarse'; end if;
  if not exists(select 1 from public.contract_lines where contract_id=p_contract_id) then raise exception 'El contrato no tiene partidas'; end if;
  update public.contracts set status='pending_authorization' where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create or replace function public.cancel_contract(p_contract_id uuid,p_reason text)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','cancel_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_contract.status not in ('draft','pending_authorization','authorized') then raise exception 'El contrato ya no puede cancelarse'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  if exists(select 1 from public.operation_requests where contract_id=p_contract_id and status<>'cancelled') then raise exception 'Cancela primero las solicitudes del contrato'; end if;
  update public.contracts set status='cancelled',notes=concat_ws(E'\n',notes,'Cancelación: '||trim(p_reason)) where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create or replace function public.authorize_request(p_request_id uuid)
returns public.operation_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare v_request public.operation_requests; v_contract public.contracts; v_line record; v_location uuid; v_available numeric; v_custody numeric;
begin
  perform set_config('andavalle.workflow_action','authorize_request',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Solicitud no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id, array['admin','commercial','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  select * into v_contract from public.contracts where id=v_request.contract_id;
  if v_contract.status not in ('authorized','active') then raise exception 'El contrato no está autorizado'; end if;
  if v_request.status not in ('draft','submitted') then raise exception 'Estado de solicitud no autorizable'; end if;
  if not exists(select 1 from public.operation_request_lines where request_id=p_request_id) then raise exception 'La solicitud no tiene partidas'; end if;

  if v_request.request_type='SS' then
    for v_line in select * from public.operation_request_lines where request_id=p_request_id order by product_id loop
      perform pg_advisory_xact_lock(hashtextextended(v_request.organization_id::text || v_line.product_id::text, 0));
      if v_line.contract_line_id is null or not exists(
        select 1 from public.contract_lines cl
        where cl.id=v_line.contract_line_id and cl.contract_id=v_contract.id and cl.product_id=v_line.product_id
          and cl.quantity >= (
            select coalesce(sum(orl.quantity),0)
            from public.operation_request_lines orl
            join public.operation_requests ore on ore.id=orl.request_id
            where ore.contract_id=v_contract.id and ore.request_type='SS' and ore.status<>'cancelled'
              and orl.contract_line_id=cl.id
          )
      ) then
        raise exception 'La partida solicitada no corresponde al contrato o excede su cantidad';
      end if;
      select a.location_id, a.available into v_location, v_available
      from public.inventory_availability a
      where a.organization_id=v_request.organization_id and a.product_id=v_line.product_id and a.available>=v_line.quantity
      order by a.available desc limit 1;
      if v_location is null then raise exception 'Inventario insuficiente para el producto %', v_line.product_id; end if;
      insert into public.stock_reservations(organization_id,request_line_id,product_id,location_id,quantity)
      values(v_request.organization_id,v_line.id,v_line.product_id,v_location,v_line.quantity)
      on conflict(request_line_id,location_id) do update set quantity=excluded.quantity, consumed_quantity=0, released_at=null;
    end loop;
  else
    for v_line in
      select product_id,sum(quantity) as quantity
      from public.operation_request_lines where request_id=p_request_id
      group by product_id order by product_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(v_request.organization_id::text || v_line.product_id::text,0));
      select coalesce(sum(case when lto.location_type='customer' then m.quantity else 0 end)
                          -sum(case when lfrom.location_type='customer' then m.quantity else 0 end),0)
      into v_custody
      from public.inventory_movements m
      left join public.inventory_locations lto on lto.id=m.to_location_id
      left join public.inventory_locations lfrom on lfrom.id=m.from_location_id
      where m.organization_id=v_request.organization_id
        and m.contract_chain_id=v_contract.contract_chain_id
        and m.product_id=v_line.product_id;
      if v_custody<v_line.quantity then
        raise exception 'La solicitud de entrada supera el saldo en custodia para el producto %',v_line.product_id;
      end if;
    end loop;
  end if;
  update public.operation_requests set status='authorized',authorized_by=(select auth.uid()),authorized_at=now()
  where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.cancel_request(p_request_id uuid)
returns public.operation_requests
language plpgsql security invoker set search_path='' as $$
declare v_request public.operation_requests;
begin
  perform set_config('andavalle.workflow_action','cancel_request',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Solicitud no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin','commercial','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_request.status in ('completed','cancelled') then raise exception 'La solicitud ya está cerrada'; end if;
  update public.stock_reservations set released_at=now() where request_line_id in (select id from public.operation_request_lines where request_id=p_request_id) and released_at is null;
  update public.operation_requests set status='cancelled' where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.submit_request(p_request_id uuid)
returns public.operation_requests
language plpgsql security invoker set search_path='' as $$
declare v_request public.operation_requests;
begin
  perform set_config('andavalle.workflow_action','submit_request',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Solicitud no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_request.status<>'draft' then raise exception 'Sólo una solicitud en borrador puede enviarse'; end if;
  if not exists(select 1 from public.operation_request_lines where request_id=p_request_id) then raise exception 'La solicitud no tiene partidas'; end if;
  update public.operation_requests set status='submitted' where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.confirm_inventory_document(p_document_id uuid)
returns public.inventory_documents
language plpgsql security invoker set search_path='' as $$
declare v_document public.inventory_documents; v_request public.operation_requests; v_contract public.contracts; v_line record; v_balance numeric; v_remaining numeric; v_complete boolean;
begin
  perform set_config('andavalle.workflow_action','confirm_document',true);
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null then raise exception 'Documento no encontrado'; end if;
  if v_document.status='confirmed' then return v_document; end if;
  if v_document.status<>'draft' then raise exception 'Documento no confirmable'; end if;
  if not private.has_any_role(v_document.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  select * into v_request from public.operation_requests where id=v_document.request_id for update;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  if v_request.status not in ('authorized','partially_fulfilled') then raise exception 'Solicitud no autorizada'; end if;
  if not exists(select 1 from public.inventory_document_lines where document_id=p_document_id) then raise exception 'Documento sin partidas'; end if;

  for v_line in select dl.*, fl.location_type as from_type, tl.location_type as to_type
                from public.inventory_document_lines dl
                left join public.inventory_locations fl on fl.id=dl.from_location_id
                left join public.inventory_locations tl on tl.id=dl.to_location_id
                where dl.document_id=p_document_id order by dl.product_id,dl.id loop
    perform pg_advisory_xact_lock(hashtextextended(v_document.organization_id::text || v_line.product_id::text,0));
    if not exists(select 1 from public.operation_request_lines where id=v_line.request_line_id and request_id=v_request.id and product_id=v_line.product_id) then raise exception 'La partida o producto no pertenece a la solicitud'; end if;
    if v_document.document_type='HS' then
      if v_line.from_type<>'available' then raise exception 'La HS debe salir de una ubicación disponible'; end if;
      if (v_contract.contract_type='rental' and v_line.to_type<>'customer') or (v_contract.contract_type='sale' and v_line.to_type<>'sold') then raise exception 'Destino inválido para el contrato'; end if;
      select quantity-consumed_quantity into v_remaining from public.stock_reservations where request_line_id=v_line.request_line_id and location_id=v_line.from_location_id and released_at is null for update;
      if coalesce(v_remaining,0)<v_line.quantity then raise exception 'Cantidad mayor que la reserva'; end if;
      select quantity into v_balance from public.inventory_balances where organization_id=v_document.organization_id and product_id=v_line.product_id and location_id=v_line.from_location_id;
      if coalesce(v_balance,0)<v_line.quantity then raise exception 'Saldo insuficiente'; end if;
      update public.stock_reservations set consumed_quantity=consumed_quantity+v_line.quantity where request_line_id=v_line.request_line_id and location_id=v_line.from_location_id;
    else
      if v_contract.contract_type<>'rental' or v_line.from_type<>'customer' or v_line.to_type not in ('available','inspection','maintenance','damaged','writeoff') then raise exception 'Clasificación de entrada inválida'; end if;
      select coalesce(sum(case when to_location_id=v_line.from_location_id then quantity else 0 end)-sum(case when from_location_id=v_line.from_location_id then quantity else 0 end),0)
      into v_balance from public.inventory_movements
      where organization_id=v_document.organization_id and contract_chain_id=v_contract.contract_chain_id and product_id=v_line.product_id;
      if coalesce(v_balance,0)<v_line.quantity then raise exception 'La devolución supera el saldo del cliente'; end if;
    end if;
    insert into public.inventory_movements(organization_id,contract_chain_id,document_id,product_id,from_location_id,to_location_id,quantity,movement_kind,created_by)
    values(v_document.organization_id,v_contract.contract_chain_id,v_document.id,v_line.product_id,v_line.from_location_id,v_line.to_location_id,v_line.quantity,lower(v_document.document_type::text),(select auth.uid()));
  end loop;

  update public.inventory_documents set status='confirmed',confirmed_by=(select auth.uid()),confirmed_at=now() where id=p_document_id returning * into v_document;
  select not exists(
    select 1 from public.operation_request_lines rl
    where rl.request_id=v_request.id and rl.quantity > coalesce((select sum(dl.quantity) from public.inventory_document_lines dl join public.inventory_documents d on d.id=dl.document_id where dl.request_line_id=rl.id and d.status='confirmed'),0)
  ) into v_complete;
  update public.operation_requests set status=case when v_complete then 'completed'::public.request_status else 'partially_fulfilled'::public.request_status end where id=v_request.id;
  if v_document.document_type='HS' and v_contract.status='authorized' then update public.contracts set status='active' where id=v_contract.id; end if;
  if v_document.document_type='HS' and v_contract.contract_type='sale' and v_complete then update public.contracts set status='closed',closed_at=now() where id=v_contract.id; end if;
  return v_document;
end;
$$;

create or replace function public.reverse_inventory_document(p_document_id uuid,p_reason text)
returns public.inventory_documents
language plpgsql security invoker set search_path='' as $$
declare v_document public.inventory_documents; v_request public.operation_requests; v_contract public.contracts; v_movement record; v_line record; v_balance numeric; v_complete boolean; v_any_fulfilled boolean;
begin
  perform set_config('andavalle.workflow_action','reverse_document',true);
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null or v_document.status<>'confirmed' then raise exception 'Documento no reversible'; end if;
  if not private.has_any_role(v_document.organization_id,array['admin']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  select * into v_request from public.operation_requests where id=v_document.request_id for update;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  for v_movement in select * from public.inventory_movements where document_id=p_document_id and reversal_of_id is null order by product_id,id loop
    perform pg_advisory_xact_lock(hashtextextended(v_document.organization_id::text || v_movement.product_id::text,0));
    if v_movement.to_location_id is not null then
      select quantity into v_balance from public.inventory_balances
      where organization_id=v_document.organization_id and product_id=v_movement.product_id and location_id=v_movement.to_location_id;
      if coalesce(v_balance,0)<v_movement.quantity then
        raise exception 'No se puede revertir: el inventario de destino ya fue consumido para el producto %',v_movement.product_id;
      end if;
    end if;
    insert into public.inventory_movements(organization_id,contract_chain_id,document_id,product_id,from_location_id,to_location_id,quantity,movement_kind,reversal_of_id,created_by)
    values(v_movement.organization_id,v_movement.contract_chain_id,v_document.id,v_movement.product_id,v_movement.to_location_id,v_movement.from_location_id,v_movement.quantity,'reversal',v_movement.id,(select auth.uid()));
  end loop;
  if v_document.document_type='HS' then
    for v_line in select * from public.inventory_document_lines where document_id=p_document_id order by id loop
      update public.stock_reservations
      set consumed_quantity=consumed_quantity-v_line.quantity,released_at=null
      where request_line_id=v_line.request_line_id and location_id=v_line.from_location_id and consumed_quantity>=v_line.quantity;
      if not found then raise exception 'No se pudo reconstruir la reserva de la partida %',v_line.id; end if;
    end loop;
  end if;
  update public.inventory_documents set status='reversed',reversed_by=(select auth.uid()),reversed_at=now(),reversal_reason=trim(p_reason) where id=p_document_id returning * into v_document;
  select not exists(
    select 1 from public.operation_request_lines rl
    where rl.request_id=v_request.id and rl.quantity>coalesce((select sum(dl.quantity) from public.inventory_document_lines dl join public.inventory_documents d on d.id=dl.document_id where dl.request_line_id=rl.id and d.status='confirmed'),0)
  ), exists(
    select 1 from public.inventory_document_lines dl join public.inventory_documents d on d.id=dl.document_id
    join public.operation_request_lines rl on rl.id=dl.request_line_id
    where rl.request_id=v_request.id and d.status='confirmed'
  ) into v_complete,v_any_fulfilled;
  update public.operation_requests
  set status=case when v_complete then 'completed'::public.request_status when v_any_fulfilled then 'partially_fulfilled'::public.request_status else 'authorized'::public.request_status end
  where id=v_request.id;
  if v_document.document_type='HS' and v_contract.status in ('active','closed') then
    update public.contracts
    set status=case when exists(
          select 1 from public.inventory_documents d join public.operation_requests r on r.id=d.request_id
          where r.contract_id=v_contract.id and d.document_type='HS' and d.status='confirmed'
        ) then 'active'::public.contract_status else 'authorized'::public.contract_status end,
        closed_at=null
    where id=v_contract.id;
  end if;
  return v_document;
end;
$$;

create or replace function public.cancel_inventory_document(p_document_id uuid,p_reason text)
returns public.inventory_documents
language plpgsql security invoker set search_path='' as $$
declare v_document public.inventory_documents;
begin
  perform set_config('andavalle.workflow_action','cancel_document',true);
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null then raise exception 'Documento no encontrado'; end if;
  if not private.has_any_role(v_document.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_document.status<>'draft' then raise exception 'Sólo un documento en borrador puede cancelarse'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  update public.inventory_documents set status='cancelled',reversal_reason=trim(p_reason) where id=p_document_id returning * into v_document;
  return v_document;
end;
$$;

create or replace function public.renew_contract(p_contract_id uuid,p_starts_on date,p_ends_on date)
returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_old public.contracts; v_new_id uuid;
begin
  perform set_config('andavalle.workflow_action','renew_contract',true);
  select * into v_old from public.contracts where id=p_contract_id for update;
  if v_old.id is null or v_old.contract_type<>'rental' or v_old.status not in ('authorized','active') then raise exception 'Contrato no renovable'; end if;
  if not private.has_any_role(v_old.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  insert into public.contracts(organization_id,contract_chain_id,previous_contract_id,customer_id,site_id,contract_type,status,starts_on,ends_on,currency,subtotal,discount_amount,tax_amount,total,notes,created_by)
  values(v_old.organization_id,v_old.contract_chain_id,v_old.id,v_old.customer_id,v_old.site_id,'rental','draft',p_starts_on,p_ends_on,v_old.currency,v_old.subtotal,v_old.discount_amount,v_old.tax_amount,v_old.total,'Renovación de '||v_old.folio,(select auth.uid())) returning id into v_new_id;
  insert into public.contract_lines(organization_id,contract_id,line_no,product_id,quantity,unit_price,discount_percent,tax_rate)
  select organization_id,v_new_id,line_no,product_id,quantity,unit_price,discount_percent,tax_rate from public.contract_lines where contract_id=v_old.id;
  return v_new_id;
end;
$$;

create or replace function public.close_contract(p_contract_id uuid,p_force boolean default false,p_reason text default null)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts; v_customer_balance numeric;
begin
  perform set_config('andavalle.workflow_action','close_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null or v_contract.status not in ('authorized','active') then raise exception 'Contrato no cerrable'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_contract.contract_type='rental' then
    select coalesce(sum(case when lto.location_type='customer' then m.quantity else 0 end)-sum(case when lfrom.location_type='customer' then m.quantity else 0 end),0)
    into v_customer_balance
    from public.inventory_movements m
    left join public.inventory_locations lto on lto.id=m.to_location_id
    left join public.inventory_locations lfrom on lfrom.id=m.from_location_id
    where m.contract_chain_id=v_contract.contract_chain_id;
    if v_customer_balance<>0 and not (p_force and private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[]) and length(trim(coalesce(p_reason,'')))>=10) then raise exception 'La cadena conserva saldo físico'; end if;
    if exists(
      select 1 from public.stock_reservations sr
      join public.operation_request_lines rl on rl.id=sr.request_line_id
      join public.operation_requests r on r.id=rl.request_id
      join public.contracts c on c.id=r.contract_id
      where c.contract_chain_id=v_contract.contract_chain_id and sr.released_at is null and sr.quantity>sr.consumed_quantity
    ) then raise exception 'La cadena conserva reservas pendientes'; end if;
  elsif not exists(select 1 from public.operation_requests where contract_id=v_contract.id and request_type='SS')
     or exists(select 1 from public.operation_requests where contract_id=v_contract.id and request_type='SS' and status<>'completed') then
    raise exception 'Una venta sólo puede cerrarse cuando sus solicitudes de salida están completas';
  end if;
  update public.contracts set status='closed',closed_at=now(),notes=concat_ws(E'\n',notes,case when p_force then 'Cierre excepcional: '||trim(p_reason) end) where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;
