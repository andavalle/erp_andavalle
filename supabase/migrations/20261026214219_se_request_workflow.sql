-- Solicitud de Entrada: programa devoluciones únicamente sobre equipo entregado.

create view public.contract_line_custody with (security_invoker=true) as
select cl.organization_id,cl.contract_id,cl.id as contract_line_id,cl.product_id,
  coalesce(sum(case when d.document_type='HS' and d.status='confirmed' then dl.quantity else 0 end),0)::numeric(14,3) as delivered,
  coalesce(sum(case when d.document_type='HE' and d.status='confirmed' then dl.quantity else 0 end),0)::numeric(14,3) as returned,
  (coalesce(sum(case when d.document_type='HS' and d.status='confirmed' then dl.quantity else 0 end),0)
   -coalesce(sum(case when d.document_type='HE' and d.status='confirmed' then dl.quantity else 0 end),0))::numeric(14,3) as in_custody
from public.contract_lines cl
left join public.operation_request_lines rl on rl.contract_line_id=cl.id
left join public.inventory_document_lines dl on dl.request_line_id=rl.id
left join public.inventory_documents d on d.id=dl.document_id
group by cl.organization_id,cl.contract_id,cl.id,cl.product_id;

grant select on public.contract_line_custody to authenticated;

create function private.contract_line_returnable(p_contract_line_id uuid,p_exclude_request_id uuid default null)
returns numeric
language sql
security invoker
stable
set search_path=''
as $$
  select greatest(coalesce(c.in_custody,0)-coalesce((
    select sum(greatest(orl.quantity-coalesce((
      select sum(dl.quantity)
      from public.inventory_document_lines dl
      join public.inventory_documents d on d.id=dl.document_id
      where dl.request_line_id=orl.id and d.document_type='HE' and d.status='confirmed'
    ),0),0))
    from public.operation_request_lines orl
    join public.operation_requests ore on ore.id=orl.request_id
    where orl.contract_line_id=p_contract_line_id and ore.request_type='SE'
      and ore.status in ('draft','submitted','authorized','partially_fulfilled')
      and (p_exclude_request_id is null or ore.id<>p_exclude_request_id)
  ),0),0)
  from public.contract_line_custody c where c.contract_line_id=p_contract_line_id
$$;

grant execute on function private.contract_line_returnable(uuid,uuid) to authenticated;

create function public.create_se_request(
  p_contract_id uuid,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb,
  p_scheduled_for timestamptz default null,
  p_vehicle text default null,
  p_operator_name text default null
)
returns public.operation_requests
language plpgsql
security invoker
set search_path=''
as $$
declare v_contract public.contracts;v_request public.operation_requests;v_item record;v_contract_line public.contract_lines;v_returnable numeric;
begin
  perform set_config('andavalle.workflow_action','create_se_request',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso para crear Solicitudes de Entrada' using errcode='42501'; end if;
  if v_contract.contract_type<>'rental' or v_contract.status<>'active' then raise exception 'La SE requiere un contrato de renta activo'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'La Solicitud de Entrada requiere al menos una partida'; end if;
  if exists(select 1 from (select value->>'contract_line_id',count(*) from jsonb_array_elements(p_lines) group by value->>'contract_line_id' having count(*)>1) duplicate) then raise exception 'No repitas partidas del contrato'; end if;
  insert into public.operation_requests(organization_id,contract_id,request_type,requested_by,notes)
  values(v_contract.organization_id,v_contract.id,'SE',(select auth.uid()),nullif(trim(coalesce(p_notes,'')),'')) returning * into v_request;
  for v_item in select value,ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(v_item.value->>'contract_line_id','') is null or nullif(v_item.value->>'quantity','') is null or (v_item.value->>'quantity')::numeric<=0 then raise exception 'Cada partida requiere contrato y cantidad mayor a cero'; end if;
    select * into v_contract_line from public.contract_lines where id=(v_item.value->>'contract_line_id')::uuid and contract_id=v_contract.id for share;
    if v_contract_line.id is null then raise exception 'La partida no pertenece al contrato'; end if;
    select private.contract_line_returnable(v_contract_line.id,v_request.id) into v_returnable;
    if (v_item.value->>'quantity')::numeric>coalesce(v_returnable,0) then raise exception 'La devolución solicitada supera el saldo en obra de %',coalesce(v_contract_line.sku_snapshot,v_contract_line.product_id::text); end if;
    insert into public.operation_request_lines(organization_id,request_id,contract_line_id,line_no,product_id,quantity)
    values(v_contract.organization_id,v_request.id,v_contract_line.id,v_item.ordinality,v_contract_line.product_id,(v_item.value->>'quantity')::numeric);
  end loop;
  if p_scheduled_for is not null or nullif(trim(coalesce(p_vehicle,'')),'') is not null or nullif(trim(coalesce(p_operator_name,'')),'') is not null then
    if not private.has_any_role(v_contract.organization_id,array['admin','logistics']::public.member_role[]) then raise exception 'Sólo administración o logística puede asignar la recolección' using errcode='42501'; end if;
    insert into public.logistics_assignments(organization_id,request_id,scheduled_for,vehicle,operator_name)
    values(v_contract.organization_id,v_request.id,p_scheduled_for,nullif(trim(coalesce(p_vehicle,'')),''),nullif(trim(coalesce(p_operator_name,'')),''));
  end if;
  return v_request;
end;
$$;

create function public.update_se_request_draft(
  p_request_id uuid,
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb,
  p_scheduled_for timestamptz default null,
  p_vehicle text default null,
  p_operator_name text default null
)
returns public.operation_requests
language plpgsql
security invoker
set search_path=''
as $$
declare v_request public.operation_requests;v_contract public.contracts;v_item record;v_line public.contract_lines;v_returnable numeric;
begin
  perform set_config('andavalle.workflow_action','update_se_request_draft',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null or v_request.request_type<>'SE' then raise exception 'Solicitud de Entrada no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin']::public.member_role[])
     and not (v_request.requested_by=(select auth.uid()) and private.has_any_role(v_request.organization_id,array['commercial']::public.member_role[])) then raise exception 'Sin permiso para editar esta solicitud' using errcode='42501'; end if;
  if v_request.status<>'draft' then raise exception 'Sólo puede editarse una solicitud en borrador'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then raise exception 'La Solicitud de Entrada requiere al menos una partida'; end if;
  if exists(select 1 from (select value->>'contract_line_id',count(*) from jsonb_array_elements(p_lines) group by value->>'contract_line_id' having count(*)>1) duplicate) then raise exception 'No repitas partidas del contrato'; end if;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  delete from public.operation_request_lines where request_id=v_request.id;
  for v_item in select value,ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(v_item.value->>'contract_line_id','') is null or nullif(v_item.value->>'quantity','') is null or (v_item.value->>'quantity')::numeric<=0 then raise exception 'Cada partida requiere contrato y cantidad mayor a cero'; end if;
    select * into v_line from public.contract_lines where id=(v_item.value->>'contract_line_id')::uuid and contract_id=v_contract.id for share;
    if v_line.id is null then raise exception 'La partida no pertenece al contrato'; end if;
    select private.contract_line_returnable(v_line.id,v_request.id) into v_returnable;
    if (v_item.value->>'quantity')::numeric>coalesce(v_returnable,0) then raise exception 'La devolución solicitada supera el saldo en obra'; end if;
    insert into public.operation_request_lines(organization_id,request_id,contract_line_id,line_no,product_id,quantity)
    values(v_request.organization_id,v_request.id,v_line.id,v_item.ordinality,v_line.product_id,(v_item.value->>'quantity')::numeric);
  end loop;
  update public.operation_requests set notes=nullif(trim(coalesce(p_notes,'')),'') where id=v_request.id returning * into v_request;
  if p_scheduled_for is not null or nullif(trim(coalesce(p_vehicle,'')),'') is not null or nullif(trim(coalesce(p_operator_name,'')),'') is not null then
    if not private.has_any_role(v_request.organization_id,array['admin','logistics']::public.member_role[]) then raise exception 'Sólo administración o logística puede asignar la recolección' using errcode='42501'; end if;
    insert into public.logistics_assignments(organization_id,request_id,scheduled_for,vehicle,operator_name)
    values(v_request.organization_id,v_request.id,p_scheduled_for,nullif(trim(coalesce(p_vehicle,'')),''),nullif(trim(coalesce(p_operator_name,'')),''))
    on conflict(request_id) do update set scheduled_for=excluded.scheduled_for,vehicle=excluded.vehicle,operator_name=excluded.operator_name;
  end if;
  return v_request;
end;
$$;

create or replace function public.authorize_request(p_request_id uuid)
returns public.operation_requests
language plpgsql
security invoker
set search_path=''
as $$
declare v_request public.operation_requests;v_contract public.contracts;v_line record;v_stock record;v_contract_quantity numeric;v_already_allocated numeric;v_remaining numeric;v_take numeric;v_returnable numeric;
begin
  perform set_config('andavalle.workflow_action','authorize_request',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Solicitud no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sólo administración o almacén puede autorizar solicitudes' using errcode='42501'; end if;
  if v_request.status<>'submitted' then raise exception 'La solicitud debe estar enviada para poder autorizarse'; end if;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  if not exists(select 1 from public.operation_request_lines where request_id=p_request_id) then raise exception 'La solicitud no tiene partidas'; end if;
  if v_request.request_type='SS' then
    if v_contract.status not in ('authorized','active') then raise exception 'El contrato no está autorizado'; end if;
    for v_line in select * from public.operation_request_lines where request_id=p_request_id order by product_id,id loop
      perform pg_advisory_xact_lock(hashtextextended(v_request.organization_id::text||v_line.product_id::text,0));
      select quantity into v_contract_quantity from public.contract_lines where id=v_line.contract_line_id and contract_id=v_contract.id and product_id=v_line.product_id;
      if v_contract_quantity is null then raise exception 'La partida solicitada no corresponde al contrato'; end if;
      select coalesce(sum(orl.quantity),0) into v_already_allocated from public.operation_request_lines orl join public.operation_requests ore on ore.id=orl.request_id
      where ore.contract_id=v_contract.id and ore.request_type='SS' and ore.id<>v_request.id and ore.status in ('authorized','partially_fulfilled','completed') and orl.contract_line_id=v_line.contract_line_id;
      if v_already_allocated+v_line.quantity>v_contract_quantity then raise exception 'La partida solicitada excede el saldo pendiente del contrato'; end if;
      v_remaining:=v_line.quantity;
      for v_stock in select location_id,available from public.inventory_availability where organization_id=v_request.organization_id and product_id=v_line.product_id and available>0 order by available desc,location_id loop
        exit when v_remaining<=0;v_take:=least(v_remaining,v_stock.available);
        insert into public.stock_reservations(organization_id,request_line_id,product_id,location_id,quantity) values(v_request.organization_id,v_line.id,v_line.product_id,v_stock.location_id,v_take);
        v_remaining:=v_remaining-v_take;
      end loop;
      if v_remaining>0 then raise exception 'Inventario insuficiente para el producto %',v_line.product_id; end if;
    end loop;
  else
    if v_contract.contract_type<>'rental' or v_contract.status<>'active' then raise exception 'La SE requiere un contrato de renta activo'; end if;
    for v_line in select * from public.operation_request_lines where request_id=p_request_id order by product_id,id loop
      perform pg_advisory_xact_lock(hashtextextended(v_request.organization_id::text||v_line.product_id::text,0));
      select private.contract_line_returnable(v_line.contract_line_id,v_request.id) into v_returnable;
      if v_line.quantity>coalesce(v_returnable,0) then raise exception 'La Solicitud de Entrada supera el saldo disponible en obra'; end if;
    end loop;
  end if;
  update public.operation_requests set status='authorized',authorized_by=(select auth.uid()),authorized_at=now() where id=p_request_id returning * into v_request;
  return v_request;
end;
$$;

revoke execute on function public.create_se_request(uuid,text,jsonb,timestamptz,text,text),public.update_se_request_draft(uuid,text,jsonb,timestamptz,text,text),public.authorize_request(uuid) from public,anon;
grant execute on function public.create_se_request(uuid,text,jsonb,timestamptz,text,text),public.update_se_request_draft(uuid,text,jsonb,timestamptz,text,text),public.authorize_request(uuid) to authenticated;
