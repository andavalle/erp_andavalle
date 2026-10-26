-- Hoja de Entrada: recepción y clasificación del equipo devuelto.

-- Cada organización necesita destinos operativos para clasificar una devolución.
insert into public.inventory_locations(organization_id,warehouse_id,code,name,location_type,active)
select o.id,w.id,'SYS-'||upper(t.location_type::text),t.name,t.location_type,true
from public.organizations o
left join lateral (
  select id from public.warehouses where organization_id=o.id and active order by created_at,id limit 1
) w on true
cross join (values
  ('available'::public.location_type,'Disponible'),
  ('inspection'::public.location_type,'Inspección'),
  ('maintenance'::public.location_type,'Mantenimiento'),
  ('damaged'::public.location_type,'Dañado'),
  ('writeoff'::public.location_type,'Baja')
) as t(location_type,name)
where not exists(
  select 1 from public.inventory_locations l
  where l.organization_id=o.id and l.location_type=t.location_type and l.active
)
on conflict(organization_id,code) do nothing;

create or replace function private.replace_he_lines(p_document_id uuid,p_lines jsonb)
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
  v_class record;
  v_source uuid;
  v_destination uuid;
  v_confirmed numeric;
  v_custody numeric;
  v_total numeric;
  v_line_no integer:=0;
begin
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null or v_document.document_type<>'HE' or v_document.status<>'draft' then
    raise exception 'Hoja de Entrada borrador no encontrada';
  end if;
  select * into v_request from public.operation_requests where id=v_document.request_id for update;
  if v_request.request_type<>'SE' or v_request.status not in ('authorized','partially_fulfilled') then
    raise exception 'La Solicitud de Entrada no está autorizada';
  end if;
  select * into v_contract from public.contracts where id=v_request.contract_id for update;
  if v_contract.contract_type<>'rental' or v_contract.status<>'active' then
    raise exception 'La Hoja de Entrada requiere un contrato de renta activo';
  end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception 'La Hoja de Entrada requiere al menos una partida';
  end if;
  if exists(
    select 1 from (
      select value->>'request_line_id',count(*) from jsonb_array_elements(p_lines)
      group by value->>'request_line_id' having count(*)>1
    ) duplicate
  ) then raise exception 'No repitas partidas de la solicitud'; end if;

  select id into v_source from public.inventory_locations
  where organization_id=v_document.organization_id and customer_site_id=v_contract.site_id
    and location_type='customer' and active order by id limit 1;
  if v_source is null then raise exception 'No existe la ubicación de custodia de la obra'; end if;

  delete from public.inventory_document_lines where document_id=v_document.id;
  for v_item in select value,ordinality from jsonb_array_elements(p_lines) with ordinality loop
    if nullif(v_item.value->>'request_line_id','') is null then
      raise exception 'Cada partida requiere una línea de la Solicitud de Entrada';
    end if;
    select * into v_request_line from public.operation_request_lines
    where id=(v_item.value->>'request_line_id')::uuid and request_id=v_request.id for share;
    if v_request_line.id is null then raise exception 'La partida no pertenece a la solicitud'; end if;

    v_total:=coalesce(nullif(v_item.value->>'available',''),'0')::numeric
      +coalesce(nullif(v_item.value->>'inspection',''),'0')::numeric
      +coalesce(nullif(v_item.value->>'maintenance',''),'0')::numeric
      +coalesce(nullif(v_item.value->>'damaged',''),'0')::numeric
      +coalesce(nullif(v_item.value->>'writeoff',''),'0')::numeric;
    if v_total<=0 then raise exception 'Cada partida incluida requiere una cantidad mayor a cero'; end if;
    if coalesce(nullif(v_item.value->>'available',''),'0')::numeric<0
       or coalesce(nullif(v_item.value->>'inspection',''),'0')::numeric<0
       or coalesce(nullif(v_item.value->>'maintenance',''),'0')::numeric<0
       or coalesce(nullif(v_item.value->>'damaged',''),'0')::numeric<0
       or coalesce(nullif(v_item.value->>'writeoff',''),'0')::numeric<0 then
      raise exception 'Las cantidades clasificadas no pueden ser negativas';
    end if;

    select coalesce(sum(dl.quantity),0) into v_confirmed
    from public.inventory_document_lines dl
    join public.inventory_documents d on d.id=dl.document_id
    where dl.request_line_id=v_request_line.id and d.document_type='HE' and d.status='confirmed';
    if v_total>v_request_line.quantity-v_confirmed then
      raise exception 'La cantidad supera el saldo pendiente de recibir';
    end if;
    select in_custody into v_custody from public.contract_line_custody
    where contract_line_id=v_request_line.contract_line_id;
    if v_total>coalesce(v_custody,0) then
      raise exception 'La devolución supera el saldo físico en obra';
    end if;

    for v_class in
      select * from (values
        ('available'::public.location_type,coalesce(nullif(v_item.value->>'available',''),'0')::numeric),
        ('inspection'::public.location_type,coalesce(nullif(v_item.value->>'inspection',''),'0')::numeric),
        ('maintenance'::public.location_type,coalesce(nullif(v_item.value->>'maintenance',''),'0')::numeric),
        ('damaged'::public.location_type,coalesce(nullif(v_item.value->>'damaged',''),'0')::numeric),
        ('writeoff'::public.location_type,coalesce(nullif(v_item.value->>'writeoff',''),'0')::numeric)
      ) as classified(location_type,quantity)
      where quantity>0
    loop
      select id into v_destination from public.inventory_locations
      where organization_id=v_document.organization_id and location_type=v_class.location_type and active
      order by case when warehouse_id is null then 1 else 0 end,id limit 1;
      if v_destination is null then raise exception 'No existe una ubicación activa para %',v_class.location_type; end if;
      v_line_no:=v_line_no+1;
      insert into public.inventory_document_lines(
        organization_id,document_id,request_line_id,line_no,product_id,from_location_id,to_location_id,quantity
      ) values(
        v_document.organization_id,v_document.id,v_request_line.id,v_line_no,v_request_line.product_id,v_source,v_destination,v_class.quantity
      );
    end loop;
  end loop;
end;
$$;

create function public.create_he_document(p_request_id uuid,p_receiver_name text,p_lines jsonb)
returns public.inventory_documents
language plpgsql
security invoker
set search_path=''
as $$
declare v_request public.operation_requests;v_document public.inventory_documents;
begin
  perform set_config('andavalle.workflow_action','create_he_document',true);
  select * into v_request from public.operation_requests where id=p_request_id for update;
  if v_request.id is null or v_request.request_type<>'SE' then raise exception 'Solicitud de Entrada no encontrada'; end if;
  if not private.has_any_role(v_request.organization_id,array['admin','warehouse']::public.member_role[]) then
    raise exception 'Sólo administración o almacén puede crear una HE' using errcode='42501';
  end if;
  if v_request.status not in ('authorized','partially_fulfilled') then raise exception 'La SE no está disponible para recibir'; end if;
  if length(trim(coalesce(p_receiver_name,'')))<3 then raise exception 'Indica quién recibió el equipo'; end if;
  insert into public.inventory_documents(organization_id,request_id,document_type,receiver_name)
  values(v_request.organization_id,v_request.id,'HE',trim(p_receiver_name)) returning * into v_document;
  perform private.replace_he_lines(v_document.id,p_lines);
  return v_document;
end;
$$;

create function public.update_he_document_draft(p_document_id uuid,p_receiver_name text,p_lines jsonb)
returns public.inventory_documents
language plpgsql
security invoker
set search_path=''
as $$
declare v_document public.inventory_documents;
begin
  perform set_config('andavalle.workflow_action','update_he_document_draft',true);
  select * into v_document from public.inventory_documents where id=p_document_id for update;
  if v_document.id is null or v_document.document_type<>'HE' or v_document.status<>'draft' then raise exception 'Hoja de Entrada borrador no encontrada'; end if;
  if not private.has_any_role(v_document.organization_id,array['admin','warehouse']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if length(trim(coalesce(p_receiver_name,'')))<3 then raise exception 'Indica quién recibió el equipo'; end if;
  update public.inventory_documents set receiver_name=trim(p_receiver_name) where id=v_document.id returning * into v_document;
  perform private.replace_he_lines(v_document.id,p_lines);
  return v_document;
end;
$$;

create function private.validate_he_confirmation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.document_type='HE' and old.status='draft' and new.status='confirmed' then
    if exists(
      select 1
      from public.inventory_document_lines current_line
      join public.operation_request_lines request_line on request_line.id=current_line.request_line_id
      where current_line.document_id=new.id
      group by current_line.request_line_id,request_line.quantity
      having sum(current_line.quantity)+coalesce((
        select sum(previous_line.quantity)
        from public.inventory_document_lines previous_line
        join public.inventory_documents previous_document on previous_document.id=previous_line.document_id
        where previous_line.request_line_id=current_line.request_line_id
          and previous_document.document_type='HE' and previous_document.status='confirmed'
          and previous_document.id<>new.id
      ),0)>request_line.quantity
    ) then raise exception 'La HE supera el saldo pendiente de una partida'; end if;

    if exists(
      select 1 from public.inventory_document_lines line
      join public.inventory_locations destination on destination.id=line.to_location_id
      where line.document_id=new.id and destination.location_type in ('damaged','writeoff')
    ) and not exists(
      select 1 from public.document_files file where file.document_id=new.id and file.file_kind='photo'
    ) then raise exception 'El equipo dañado o dado de baja requiere al menos una fotografía'; end if;
  end if;
  return new;
end;
$$;

create trigger inventory_documents_validate_he_confirmation
before update on public.inventory_documents
for each row execute function private.validate_he_confirmation();

revoke execute on function private.replace_he_lines(uuid,jsonb) from public,anon;
revoke execute on function private.validate_he_confirmation() from public,anon,authenticated;
revoke execute on function public.create_he_document(uuid,text,jsonb),public.update_he_document_draft(uuid,text,jsonb) from public,anon;
grant execute on function private.replace_he_lines(uuid,jsonb) to authenticated;
grant execute on function public.create_he_document(uuid,text,jsonb),public.update_he_document_draft(uuid,text,jsonb) to authenticated;
