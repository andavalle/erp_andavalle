create or replace function public.update_quotation_draft(
  p_quotation_id uuid,p_contact_id uuid,p_starts_on date,p_ends_on date,
  p_operation_mode text default null,p_rental_operation_id uuid default null,
  p_proposed_operation_name text default null,p_purpose text default 'initial',
  p_other_purpose text default null,p_discount_percent numeric default 0,
  p_discount_reason text default null,p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns public.quotations language plpgsql security invoker set search_path='' as $$
declare
  v_quote public.quotations; v_contact public.customer_contacts; v_line jsonb;
  v_product public.products; v_price numeric; v_start date; v_end date;
  v_days integer; v_factor numeric; v_floor_multiplier numeric; v_floor numeric; v_unit numeric;
  v_subtotal numeric; v_line_discount numeric; v_tax numeric; v_line_no integer:=0;
begin
  select * into v_quote from public.quotations where id=p_quotation_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada'; end if;
  if v_quote.status<>'draft' or not v_quote.is_current then raise exception 'Sólo puede editarse el borrador vigente'; end if;
  if not private.has_any_role(v_quote.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_quote.organization_id,array['commercial']::public.member_role[]) and v_quote.created_by=(select auth.uid())) then
    raise exception 'Sin permiso para editar esta cotización' using errcode='42501';
  end if;
  select * into v_contact from public.customer_contacts
  where id=p_contact_id and organization_id=v_quote.organization_id and customer_id=v_quote.customer_id and active and archived_at is null;
  if v_contact.id is null then raise exception 'Contacto inválido para el cliente'; end if;
  if p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'La fecha final no puede ser anterior'; end if;
  if v_quote.quotation_type='rental' and (p_ends_on is null or p_ends_on-p_starts_on+1<5) then raise exception 'La renta mínima es de 5 días'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Agrega al menos una partida'; end if;
  if v_quote.quotation_type='rental' and p_operation_mode='existing' and not exists(
    select 1 from public.rental_operations o where o.id=p_rental_operation_id and o.organization_id=v_quote.organization_id
      and o.customer_id=v_quote.customer_id and o.site_id=v_quote.site_id and o.status in ('planned','active','pending_return')
  ) then raise exception 'La OR seleccionada no corresponde al cliente y obra'; end if;

  update public.quotations set
    contact_id=v_contact.id,starts_on=p_starts_on,ends_on=p_ends_on,
    operation_mode=case when quotation_type='rental' then p_operation_mode end,
    rental_operation_id=case when quotation_type='rental' then p_rental_operation_id end,
    proposed_operation_name=case when quotation_type='rental' then nullif(trim(coalesce(p_proposed_operation_name,'')),'') end,
    purpose=p_purpose,other_purpose=nullif(trim(coalesce(p_other_purpose,'')),''),
    discount_percent=coalesce(p_discount_percent,0),discount_reason=nullif(trim(coalesce(p_discount_reason,'')),''),
    discount_authorized_by=null,discount_authorized_at=null,notes=nullif(trim(coalesce(p_notes,'')),'')
  where id=v_quote.id returning * into v_quote;

  delete from public.quotation_lines where quotation_id=v_quote.id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_no:=v_line_no+1;
    select * into v_product from public.products
    where id=(v_line->>'product_id')::uuid and organization_id=v_quote.organization_id and active;
    if v_product.id is null then raise exception 'Producto inválido en partida %',v_line_no; end if;
    select amount into v_price from public.product_prices
    where organization_id=v_quote.organization_id and product_id=v_product.id
      and quotation_type=v_quote.quotation_type and active and valid_from<=p_starts_on
      and (valid_until is null or valid_until>=p_starts_on)
    order by valid_from desc limit 1;
    if v_price is null then raise exception 'No existe precio vigente para %',v_product.sku; end if;
    if coalesce((v_line->>'quantity')::numeric,0)<=0 then raise exception 'Cantidad inválida en %',v_product.sku; end if;
    v_start:=coalesce(nullif(v_line->>'starts_on','')::date,p_starts_on);
    v_end:=coalesce(nullif(v_line->>'ends_on','')::date,p_ends_on);
    v_factor:=null;v_floor_multiplier:=null;v_days:=null;v_floor:=0;v_unit:=v_price;
    if v_quote.quotation_type='rental' and v_product.item_type='inventory' then
      if v_end is null or v_end<v_start then raise exception 'Fechas inválidas en %',v_product.sku; end if;
      v_days:=v_end-v_start+1;
      if v_days<5 then raise exception 'La partida % no cumple la renta mínima de 5 días',v_product.sku; end if;
      select rate_factor,floor_multiplier into v_factor,v_floor_multiplier from public.rental_rate_tiers
      where organization_id=v_quote.organization_id and active and valid_from<=v_start
        and (valid_until is null or valid_until>=v_start) and min_days<=v_days and (max_days is null or max_days>=v_days)
      order by valid_from desc,min_days desc limit 1;
      if v_factor is null then raise exception 'No existe factor de renta para % días',v_days; end if;
      v_floor:=round(v_price*v_floor_multiplier,2);
      v_unit:=greatest(round(v_price*v_days*v_factor,2),v_floor);
    end if;
    v_subtotal:=round((v_line->>'quantity')::numeric*v_unit,2);
    v_line_discount:=case when v_product.item_type='inventory' then round(v_subtotal*v_quote.discount_percent/100,2) else 0 end;
    v_tax:=round((v_subtotal-v_line_discount)*.16,2);
    insert into public.quotation_lines(
      organization_id,quotation_id,line_no,product_id,sku_snapshot,description_snapshot,item_type,quantity,
      billing_unit,starts_on,ends_on,rental_days,base_unit_price,rate_factor,floor_amount,unit_price,
      subtotal,discount_amount,tax_amount,total
    ) values(
      v_quote.organization_id,v_quote.id,v_line_no,v_product.id,v_product.sku,v_product.description,v_product.item_type,(v_line->>'quantity')::numeric,
      case when v_quote.quotation_type='rental' and v_product.item_type='inventory' then 'day' else 'fixed' end,
      v_start,v_end,v_days,v_price,v_factor,v_floor,v_unit,v_subtotal,v_line_discount,v_tax,v_subtotal-v_line_discount+v_tax
    );
  end loop;
  select * into v_quote from public.quotations where id=v_quote.id;
  return v_quote;
end;
$$;

create or replace function public.set_product_price(
  p_product_id uuid,p_quotation_type public.contract_type,p_amount numeric,p_effective_from date default current_date
)
returns public.product_prices language plpgsql security invoker set search_path='' as $$
declare v_product public.products;v_current public.product_prices;v_result public.product_prices;
begin
  select * into v_product from public.products where id=p_product_id for update;
  if v_product.id is null then raise exception 'Producto no encontrado'; end if;
  if not private.has_any_role(v_product.organization_id,array['admin']::public.member_role[]) then
    raise exception 'Sólo administración puede cambiar precios' using errcode='42501';
  end if;
  if p_amount<0 then raise exception 'El precio no puede ser negativo'; end if;
  if p_effective_from<current_date then raise exception 'La nueva vigencia no puede iniciar en el pasado'; end if;
  select * into v_current from public.product_prices
  where organization_id=v_product.organization_id and product_id=v_product.id and quotation_type=p_quotation_type
    and active and valid_until is null for update;
  if v_current.id is not null and v_current.valid_from=p_effective_from then
    update public.product_prices set amount=round(p_amount,2),created_by=(select auth.uid()) where id=v_current.id returning * into v_result;
    return v_result;
  end if;
  if v_current.id is not null and p_effective_from<v_current.valid_from then raise exception 'Ya existe un precio con vigencia posterior'; end if;
  if v_current.id is not null then update public.product_prices set valid_until=p_effective_from-1 where id=v_current.id; end if;
  insert into public.product_prices(organization_id,product_id,quotation_type,amount,valid_from,created_by)
  values(v_product.organization_id,v_product.id,p_quotation_type,round(p_amount,2),p_effective_from,(select auth.uid()))
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.replace_rental_rate_tiers(p_effective_from date,p_tiers jsonb)
returns setof public.rental_rate_tiers language plpgsql security invoker set search_path='' as $$
declare v_org uuid;v_item jsonb;v_expected integer:=5;v_count integer:=0;v_max integer;
begin
  select m.organization_id into v_org from public.organization_members m
  where m.profile_id=(select auth.uid()) and m.active
  order by m.created_at limit 1;
  if v_org is null or not private.has_any_role(v_org,array['admin']::public.member_role[]) then
    raise exception 'Sólo administración puede cambiar factores' using errcode='42501';
  end if;
  if p_effective_from<current_date then raise exception 'La nueva vigencia no puede iniciar en el pasado'; end if;
  if jsonb_typeof(p_tiers)<>'array' or jsonb_array_length(p_tiers)=0 then raise exception 'Agrega al menos un rango'; end if;
  for v_item in select value from jsonb_array_elements(p_tiers) order by (value->>'min_days')::integer loop
    v_count:=v_count+1;
    if (v_item->>'min_days')::integer<>v_expected then raise exception 'Los rangos deben ser continuos desde 5 días'; end if;
    if (v_item->>'rate_factor')::numeric<=0 or (v_item->>'floor_multiplier')::numeric<0 then raise exception 'Factor o piso inválido'; end if;
    v_max:=nullif(v_item->>'max_days','')::integer;
    if v_max is null then
      if v_count<>jsonb_array_length(p_tiers) then raise exception 'Sólo el último rango puede quedar abierto'; end if;
      v_expected:=null;
    else
      if v_max<(v_item->>'min_days')::integer then raise exception 'Rango de días inválido'; end if;
      v_expected:=v_max+1;
    end if;
  end loop;
  if v_expected is not null then raise exception 'El último rango debe quedar abierto'; end if;

  perform 1 from public.rental_rate_tiers where organization_id=v_org and active and valid_until is null for update;
  if exists(select 1 from public.rental_rate_tiers where organization_id=v_org and active and valid_until is null and valid_from>p_effective_from) then
    raise exception 'La nueva vigencia debe ser posterior a la configuración actual';
  end if;
  if exists(select 1 from public.rental_rate_tiers where organization_id=v_org and active and valid_until is null and valid_from=p_effective_from) then
    delete from public.rental_rate_tiers where organization_id=v_org and active and valid_until is null and valid_from=p_effective_from;
  else
    update public.rental_rate_tiers set valid_until=p_effective_from-1 where organization_id=v_org and active and valid_until is null;
  end if;
  insert into public.rental_rate_tiers(organization_id,code,min_days,max_days,rate_factor,floor_multiplier,valid_from)
  select v_org,value->>'code',(value->>'min_days')::integer,nullif(value->>'max_days','')::integer,
    (value->>'rate_factor')::numeric,(value->>'floor_multiplier')::numeric,p_effective_from
  from jsonb_array_elements(p_tiers);
  return query select * from public.rental_rate_tiers
    where organization_id=v_org and valid_from=p_effective_from order by min_days;
end;
$$;

revoke execute on function public.update_quotation_draft(uuid,uuid,date,date,text,uuid,text,text,text,numeric,text,text,jsonb) from public,anon;
revoke execute on function public.set_product_price(uuid,public.contract_type,numeric,date) from public,anon;
revoke execute on function public.replace_rental_rate_tiers(date,jsonb) from public,anon;
grant execute on function public.update_quotation_draft(uuid,uuid,date,date,text,uuid,text,text,text,numeric,text,text,jsonb),public.set_product_price(uuid,public.contract_type,numeric,date),public.replace_rental_rate_tiers(date,jsonb) to authenticated;
