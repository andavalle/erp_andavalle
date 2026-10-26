-- Hoja de Salida: creación desde reservas, surtido parcial y confirmación idempotente.

create unique index inventory_documents_one_draft_per_request_type
on public.inventory_documents(request_id,document_type)
where status='draft';

create or replace function private.replace_hs_lines(p_document_id uuid,p_lines jsonb)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_document public.inventory_documents;
  v_request public.operation_requests;
  v_contract public.contracts;
  v_request_line public.operation_request_lines;
  v_item record;
  v_reservation record;
  v_destination uuid;
  v_confirmed numeric;
  v_remaining numeric;
  v_take numeric;
  v_line_no integer:=0;
begin
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null or v_document.document_type<>'HS' or v_document.status<>'draft' then
    raise exception 'Hoja de Salida borrador no encontrada';
  end if;
  select * into v_request from public.operation_requests where id=v_document.request_id for update;
  if v_request.request_type<>'SS' or v_request.status not in ('authorized','partially_fulfilled') then
    raise exception 'La Solicitud de Salida no está autorizada';
  end if;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception 'La Hoja de Salida requiere al menos una partida';
  end if;
  if exists(
    select 1 from (
      select value->>'request_line_id' as request_line_id,count(*)
      from jsonb_array_elements(p_lines)
      group by value->>'request_line_id' having count(*)>1
    ) duplicate
  ) then raise exception 'No repitas partidas de la solicitud'; end if;

  if v_contract.contract_type='rental' then
    select id into v_destination from public.inventory_locations
    where organization_id=v_document.organization_id and customer_site_id=v_contract.site_id
      and location_type='customer' and active order by id limit 1;
  else
    select id into v_destination from public.inventory_locations
    where organization_id=v_document.organization_id and location_type='sold' and active order by id limit 1;
  end if;
  if v_destination is null then raise exception 'No existe una ubicación destino válida para el contrato'; end if;

  delete from public.inventory_document_lines where document_id=v_document.id;
  for v_item in select value,ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(v_item.value->>'request_line_id','') is null
       or nullif(v_item.value->>'quantity','') is null
       or (v_item.value->>'quantity')::numeric<=0 then
      raise exception 'Cada partida requiere solicitud y cantidad mayor a cero';
    end if;
    select * into v_request_line from public.operation_request_lines
    where id=(v_item.value->>'request_line_id')::uuid and request_id=v_request.id for share;
    if v_request_line.id is null then raise exception 'La partida no pertenece a la solicitud'; end if;
    select coalesce(sum(dl.quantity),0) into v_confirmed
    from public.inventory_document_lines dl
    join public.inventory_documents d on d.id=dl.document_id
    where dl.request_line_id=v_request_line.id and d.document_type='HS' and d.status='confirmed';
    if (v_item.value->>'quantity')::numeric>v_request_line.quantity-v_confirmed then
      raise exception 'La cantidad supera el saldo pendiente de surtir';
    end if;
    v_remaining:=(v_item.value->>'quantity')::numeric;
    for v_reservation in
      select location_id,quantity-consumed_quantity as available
      from public.stock_reservations
      where request_line_id=v_request_line.id and released_at is null and quantity>consumed_quantity
      order by location_id for update
    loop
      exit when v_remaining<=0;
      v_take:=least(v_remaining,v_reservation.available);
      v_line_no:=v_line_no+1;
      insert into public.inventory_document_lines(organization_id,document_id,request_line_id,line_no,product_id,from_location_id,to_location_id,quantity)
      values(v_document.organization_id,v_document.id,v_request_line.id,v_line_no,v_request_line.product_id,v_reservation.location_id,v_destination,v_take);
      v_remaining:=v_remaining-v_take;
    end loop;
    if v_remaining>0 then raise exception 'La partida no tiene reserva suficiente'; end if;
  end loop;
end;
$$;

create function public.create_hs_document(p_request_id uuid,p_receiver_name text,p_lines jsonb)
returns public.inventory_documents
language plpgsql
security invoker
set search_path=''
as $$
declare v_request public.operation_requests;v_document public.inventory_documents;
begin
  perform set_config('andavalle.workflow_action','create_hs_document',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null or v_request.request_type<>'SS' then raise exception 'Solicitud de Salida no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin','warehouse']::public.member_role[]) then
    raise exception 'Sólo administración o almacén puede crear una HS' using errcode='42501';
  end if;
  if v_request.status not in ('authorized','partially_fulfilled') then raise exception 'La SS no está disponible para surtir'; end if;
  if length(trim(coalesce(p_receiver_name,'')))<3 then raise exception 'Indica el nombre del receptor'; end if;
  insert into public.inventory_documents(organization_id,request_id,document_type,receiver_name)
  values(v_request.organization_id,v_request.id,'HS',trim(p_receiver_name)) returning * into v_document;
  perform private.replace_hs_lines(v_document.id,p_lines);
  return v_document;
end;
$$;

create function public.update_hs_document_draft(p_document_id uuid,p_receiver_name text,p_lines jsonb)
returns public.inventory_documents
language plpgsql
security invoker
set search_path=''
as $$
declare v_document public.inventory_documents;
begin
  perform set_config('andavalle.workflow_action','update_hs_document_draft',true);
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null or v_document.document_type<>'HS' or v_document.status<>'draft' then raise exception 'Hoja de Salida borrador no encontrada'; end if;
  if not private.has_any_role(v_document.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if length(trim(coalesce(p_receiver_name,'')))<3 then raise exception 'Indica el nombre del receptor'; end if;
  update public.inventory_documents set receiver_name=trim(p_receiver_name) where id=v_document.id returning * into v_document;
  perform private.replace_hs_lines(v_document.id,p_lines);
  return v_document;
end;
$$;

create or replace function public.confirm_inventory_document(p_document_id uuid)
returns public.inventory_documents
language plpgsql
security invoker
set search_path=''
as $$
declare v_document public.inventory_documents;v_request public.operation_requests;v_contract public.contracts;v_line record;v_balance numeric;v_remaining numeric;v_complete boolean;
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
  if v_document.document_type='HS' and length(trim(coalesce(v_document.receiver_name,'')))<3 then raise exception 'La HS requiere receptor'; end if;

  for v_line in
    select dl.*,fl.location_type as from_type,tl.location_type as to_type
    from public.inventory_document_lines dl
    left join public.inventory_locations fl on fl.id=dl.from_location_id
    left join public.inventory_locations tl on tl.id=dl.to_location_id
    where dl.document_id=p_document_id order by dl.product_id,dl.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_document.organization_id::text||v_line.product_id::text,0));
    if not exists(select 1 from public.operation_request_lines where id=v_line.request_line_id and request_id=v_request.id and product_id=v_line.product_id) then raise exception 'La partida no pertenece a la solicitud'; end if;
    if v_document.document_type='HS' then
      if v_request.request_type<>'SS' or v_line.from_type<>'available' then raise exception 'Origen inválido para Hoja de Salida'; end if;
      if (v_contract.contract_type='rental' and v_line.to_type<>'customer') or (v_contract.contract_type='sale' and v_line.to_type<>'sold') then raise exception 'Destino inválido para el contrato'; end if;
      select quantity-consumed_quantity into v_remaining from public.stock_reservations
      where request_line_id=v_line.request_line_id and location_id=v_line.from_location_id and released_at is null for update;
      if coalesce(v_remaining,0)<v_line.quantity then raise exception 'Cantidad mayor que la reserva'; end if;
      select quantity into v_balance from public.inventory_balances
      where organization_id=v_document.organization_id and product_id=v_line.product_id and location_id=v_line.from_location_id;
      if coalesce(v_balance,0)<v_line.quantity then raise exception 'Saldo insuficiente'; end if;
      update public.stock_reservations set consumed_quantity=consumed_quantity+v_line.quantity
      where request_line_id=v_line.request_line_id and location_id=v_line.from_location_id;
    else
      if v_request.request_type<>'SE' or v_contract.contract_type<>'rental' or v_line.from_type<>'customer' or v_line.to_type not in ('available','inspection','maintenance','damaged','writeoff') then raise exception 'Clasificación de entrada inválida'; end if;
      select coalesce(sum(case when to_location_id=v_line.from_location_id then quantity else 0 end)-sum(case when from_location_id=v_line.from_location_id then quantity else 0 end),0)
      into v_balance from public.inventory_movements
      where organization_id=v_document.organization_id and contract_chain_id=v_contract.contract_chain_id and product_id=v_line.product_id;
      if coalesce(v_balance,0)<v_line.quantity then raise exception 'La devolución supera el saldo del cliente'; end if;
    end if;
    insert into public.inventory_movements(organization_id,contract_chain_id,document_id,product_id,from_location_id,to_location_id,quantity,movement_kind,created_by)
    values(v_document.organization_id,v_contract.contract_chain_id,v_document.id,v_line.product_id,v_line.from_location_id,v_line.to_location_id,v_line.quantity,lower(v_document.document_type::text),(select auth.uid()));
  end loop;

  update public.inventory_documents set status='confirmed',confirmed_by=(select auth.uid()),confirmed_at=now()
  where id=p_document_id returning * into v_document;
  select not exists(
    select 1 from public.operation_request_lines rl where rl.request_id=v_request.id
      and rl.quantity>coalesce((select sum(dl.quantity) from public.inventory_document_lines dl join public.inventory_documents d on d.id=dl.document_id where dl.request_line_id=rl.id and d.status='confirmed'),0)
  ) into v_complete;
  update public.operation_requests set status=case when v_complete then 'completed'::public.request_status else 'partially_fulfilled'::public.request_status end where id=v_request.id;
  if v_document.document_type='HS' and v_contract.status='authorized' then update public.contracts set status='active' where id=v_contract.id; end if;
  if v_document.document_type='HS' and v_contract.contract_type='sale' and v_complete then update public.contracts set status='closed',closed_at=now() where id=v_contract.id; end if;
  return v_document;
end;
$$;

revoke execute on function private.replace_hs_lines(uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.create_hs_document(uuid,text,jsonb),public.update_hs_document_draft(uuid,text,jsonb),public.confirm_inventory_document(uuid) from public,anon;
grant execute on function public.create_hs_document(uuid,text,jsonb),public.update_hs_document_draft(uuid,text,jsonb),public.confirm_inventory_document(uuid) to authenticated;
