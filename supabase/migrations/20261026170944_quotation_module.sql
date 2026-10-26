-- CRM quotations vertical slice: prices, rental rules, revisions and conversion.

alter table public.products
  add column item_type text not null default 'inventory'
    check (item_type in ('inventory','service'));

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  quotation_type public.contract_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,product_id) references public.products(organization_id,id) on delete restrict,
  check (valid_until is null or valid_until >= valid_from)
);

create unique index product_prices_current_unique
on public.product_prices(organization_id,product_id,quotation_type)
where active and valid_until is null;

create table public.rental_rate_tiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  min_days integer not null check (min_days >= 1),
  max_days integer check (max_days is null or max_days >= min_days),
  rate_factor numeric(6,3) not null check (rate_factor > 0),
  floor_multiplier numeric(8,3) not null check (floor_multiplier >= 0),
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,code,valid_from),
  unique (organization_id,id),
  check (valid_until is null or valid_until >= valid_from)
);

create table public.rental_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  site_id uuid not null,
  folio text,
  name text not null check (length(trim(name)) between 3 and 160),
  status text not null default 'planned' check (status in ('planned','active','pending_return','closed','cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,folio),
  unique (organization_id,id),
  foreign key (organization_id,customer_id) references public.customers(organization_id,id) on delete restrict,
  foreign key (organization_id,site_id) references public.customer_sites(organization_id,id) on delete restrict
);

alter table public.contracts
  add column rental_operation_id uuid,
  add constraint contracts_rental_operation_fk
    foreign key (organization_id,rental_operation_id) references public.rental_operations(organization_id,id) on delete restrict;

alter table public.contract_lines
  add column starts_on date,
  add column ends_on date,
  add column billing_unit text not null default 'fixed' check (billing_unit in ('day','fixed')),
  add column sku_snapshot text,
  add column description_snapshot text,
  add column base_unit_price numeric(14,2) check (base_unit_price is null or base_unit_price >= 0),
  add column rate_factor numeric(6,3) check (rate_factor is null or rate_factor > 0),
  add constraint contract_lines_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid not null,
  customer_id uuid not null,
  contact_id uuid not null,
  site_id uuid not null,
  quotation_type public.contract_type not null,
  base_folio text,
  folio text,
  revision_number integer not null default 0 check (revision_number >= 0),
  previous_revision_id uuid,
  is_current boolean not null default true,
  status text not null default 'draft' check (status in ('draft','sent','accepted','converted','rejected','expired','cancelled')),
  issued_at timestamptz,
  valid_until date,
  starts_on date not null,
  ends_on date,
  operation_mode text check (operation_mode in ('new','existing')),
  rental_operation_id uuid,
  proposed_operation_name text,
  purpose text not null default 'initial' check (purpose in ('initial','renewal','expansion','terms_change','replacement','other')),
  other_purpose text,
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_reason text,
  discount_authorized_by uuid references public.profiles(id) on delete restrict,
  discount_authorized_at timestamptz,
  subtotal_equipment numeric(14,2) not null default 0 check (subtotal_equipment >= 0),
  subtotal_services numeric(14,2) not null default 0 check (subtotal_services >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text,
  acceptance_evidence_path text,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete restrict,
  converted_contract_id uuid,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,folio),
  unique (organization_id,id),
  foreign key (organization_id,lead_id) references public.crm_leads(organization_id,id) on delete restrict,
  foreign key (organization_id,customer_id) references public.customers(organization_id,id) on delete restrict,
  foreign key (organization_id,contact_id) references public.customer_contacts(organization_id,id) on delete restrict,
  foreign key (organization_id,site_id) references public.customer_sites(organization_id,id) on delete restrict,
  foreign key (organization_id,previous_revision_id) references public.quotations(organization_id,id) on delete restrict,
  foreign key (organization_id,rental_operation_id) references public.rental_operations(organization_id,id) on delete restrict,
  foreign key (organization_id,converted_contract_id) references public.contracts(organization_id,id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on),
  check (purpose <> 'other' or length(trim(coalesce(other_purpose,''))) >= 3),
  check (discount_percent <= 10 or length(trim(coalesce(discount_reason,''))) >= 5),
  constraint quotations_operation_check check (
    (quotation_type='sale' and operation_mode is null and rental_operation_id is null and proposed_operation_name is null)
    or
    (quotation_type='rental' and operation_mode is not null and (
      (operation_mode='new' and length(trim(coalesce(proposed_operation_name,''))) >= 3)
      or (operation_mode='existing' and rental_operation_id is not null)
    ))
  )
);

create unique index quotations_current_revision_unique
on public.quotations(organization_id,base_folio)
where is_current;
create unique index quotations_contract_unique
on public.quotations(converted_contract_id)
where converted_contract_id is not null;
create index quotations_lead_idx on public.quotations(lead_id,created_at desc);
create index quotations_customer_idx on public.quotations(organization_id,customer_id,status);

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quotation_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  sku_snapshot text not null,
  description_snapshot text not null,
  item_type text not null check (item_type in ('inventory','service')),
  quantity numeric(14,3) not null check (quantity > 0),
  billing_unit text not null check (billing_unit in ('day','fixed')),
  starts_on date,
  ends_on date,
  rental_days integer check (rental_days is null or rental_days >= 1),
  base_unit_price numeric(14,2) not null check (base_unit_price >= 0),
  rate_factor numeric(6,3) check (rate_factor is null or rate_factor > 0),
  floor_amount numeric(14,2) not null default 0 check (floor_amount >= 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(5,4) not null default .16 check (tax_rate between 0 and 1),
  tax_amount numeric(14,2) not null check (tax_amount >= 0),
  total numeric(14,2) not null check (total >= 0),
  unique (quotation_id,line_no),
  unique (organization_id,id),
  foreign key (organization_id,quotation_id) references public.quotations(organization_id,id) on delete restrict,
  foreign key (organization_id,product_id) references public.products(organization_id,id) on delete restrict,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create or replace function private.seed_quotation_rules_for_organization(p_organization_id uuid)
returns void language sql security definer set search_path='' as $$
  insert into public.rental_rate_tiers(organization_id,code,min_days,max_days,rate_factor,floor_multiplier) values
    (p_organization_id,'D05_06',5,6,1.30,6.50),
    (p_organization_id,'D07_14',7,14,1.20,7.80),
    (p_organization_id,'D15_29',15,29,1.10,16.80),
    (p_organization_id,'D30_60',30,60,1.00,31.90),
    (p_organization_id,'D61_PLUS',61,null,.90,60.00)
  on conflict (organization_id,code,valid_from) do nothing;
$$;

select private.seed_quotation_rules_for_organization(id) from public.organizations;

create or replace function private.seed_quotation_rules_on_organization_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.seed_quotation_rules_for_organization(new.id); return new; end;
$$;
create trigger organizations_seed_quotation_rules after insert on public.organizations
for each row execute function private.seed_quotation_rules_on_organization_insert();

create or replace function private.prepare_rental_operation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.customer_sites s where s.id=new.site_id and s.organization_id=new.organization_id and s.customer_id=new.customer_id) then
    raise exception 'La obra no pertenece al cliente';
  end if;
  if new.folio is null then new.folio:=private.next_folio(new.organization_id,'OR',current_date); end if;
  return new;
end;
$$;
create trigger rental_operations_prepare before insert on public.rental_operations
for each row execute function private.prepare_rental_operation();
create trigger rental_operations_updated before update on public.rental_operations
for each row execute function private.set_updated_at();

create or replace function private.prepare_quotation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.base_folio is null then
    new.base_folio:=private.next_folio(new.organization_id,case new.quotation_type when 'rental' then 'COT-R' else 'COT-V' end,new.starts_on);
  end if;
  new.folio:=new.base_folio||'-R'||lpad(new.revision_number::text,2,'0');
  return new;
end;
$$;
create trigger quotations_prepare before insert on public.quotations
for each row execute function private.prepare_quotation();
create trigger quotations_updated before update on public.quotations
for each row execute function private.set_updated_at();

create or replace function private.protect_quotation()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status is distinct from new.status and coalesce(current_setting('andavalle.quotation_action',true),'')='' then
    raise exception 'El estado sólo puede cambiar mediante una operación de cotización' using errcode='42501';
  end if;
  if old.status<>'draft' and coalesce(current_setting('andavalle.quotation_action',true),'')='' and (
    old.customer_id is distinct from new.customer_id or old.contact_id is distinct from new.contact_id or
    old.site_id is distinct from new.site_id or old.starts_on is distinct from new.starts_on or
    old.ends_on is distinct from new.ends_on or old.discount_percent is distinct from new.discount_percent or
    old.notes is distinct from new.notes
  ) then raise exception 'Una cotización emitida es inmutable; crea una revisión' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger quotations_protect before update on public.quotations
for each row execute function private.protect_quotation();

create or replace function private.guard_quotation_line()
returns trigger language plpgsql set search_path='' as $$
declare v_status text;
begin
  if tg_op='UPDATE' and old.quotation_id is distinct from new.quotation_id then raise exception 'No se permite mover una partida'; end if;
  select status into v_status from public.quotations where id=coalesce(new.quotation_id,old.quotation_id) for update;
  if v_status<>'draft' then raise exception 'Las partidas de una cotización emitida son inmutables' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger quotation_lines_guard before insert or update or delete on public.quotation_lines
for each row execute function private.guard_quotation_line();

create or replace function private.recalculate_quotation_totals()
returns trigger language plpgsql set search_path='' as $$
declare v_id uuid:=coalesce(new.quotation_id,old.quotation_id); v_discount numeric;
begin
  select discount_percent into v_discount from public.quotations where id=v_id;
  update public.quotations q set
    subtotal_equipment=x.equipment,
    subtotal_services=x.services,
    discount_amount=round(x.equipment*v_discount/100,2),
    tax_amount=round((x.services+x.equipment*(1-v_discount/100))*.16,2),
    total=round((x.services+x.equipment*(1-v_discount/100))*1.16,2)
  from (
    select round(coalesce(sum(subtotal) filter(where item_type='inventory'),0),2) equipment,
           round(coalesce(sum(subtotal) filter(where item_type='service'),0),2) services
    from public.quotation_lines where quotation_id=v_id
  ) x where q.id=v_id;
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger quotation_lines_recalculate after insert or update or delete on public.quotation_lines
for each row execute function private.recalculate_quotation_totals();

create or replace function public.create_quotation(
  p_lead_id uuid,p_contact_id uuid,p_quotation_type public.contract_type,
  p_starts_on date,p_ends_on date,p_operation_mode text default null,
  p_rental_operation_id uuid default null,p_proposed_operation_name text default null,
  p_purpose text default 'initial',p_other_purpose text default null,
  p_discount_percent numeric default 0,p_discount_reason text default null,
  p_notes text default null,p_lines jsonb default '[]'::jsonb
)
returns public.quotations language plpgsql security invoker set search_path='' as $$
declare
  v_lead public.crm_leads; v_quote public.quotations; v_contact public.customer_contacts;
  v_line jsonb; v_product public.products; v_price numeric; v_start date; v_end date;
  v_days integer; v_factor numeric; v_floor_multiplier numeric; v_floor numeric; v_unit numeric;
  v_subtotal numeric; v_line_discount numeric; v_tax numeric; v_line_no integer:=0;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if v_lead.status in ('won','lost') then raise exception 'La oportunidad ya está cerrada'; end if;
  if v_lead.customer_id is null or v_lead.site_id is null then raise exception 'Convierte primero la oportunidad a cliente y obra'; end if;
  if not private.has_any_role(v_lead.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_lead.organization_id,array['commercial']::public.member_role[]) and v_lead.assigned_to=(select auth.uid())) then
    raise exception 'Sin permiso para cotizar esta oportunidad' using errcode='42501';
  end if;
  select * into v_contact from public.customer_contacts where id=p_contact_id and organization_id=v_lead.organization_id and customer_id=v_lead.customer_id and active and archived_at is null;
  if v_contact.id is null then raise exception 'Contacto inválido para el cliente'; end if;
  if p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'La fecha final no puede ser anterior'; end if;
  if p_quotation_type='rental' and (p_ends_on is null or p_ends_on-p_starts_on+1<5) then raise exception 'La renta mínima es de 5 días'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Agrega al menos una partida'; end if;
  if p_quotation_type='rental' and p_operation_mode='existing' and not exists(
    select 1 from public.rental_operations o where o.id=p_rental_operation_id and o.organization_id=v_lead.organization_id
      and o.customer_id=v_lead.customer_id and o.site_id=v_lead.site_id and o.status in ('planned','active','pending_return')
  ) then raise exception 'La OR seleccionada no corresponde al cliente y obra'; end if;

  insert into public.quotations(
    organization_id,lead_id,customer_id,contact_id,site_id,quotation_type,starts_on,ends_on,
    operation_mode,rental_operation_id,proposed_operation_name,purpose,other_purpose,
    discount_percent,discount_reason,notes,created_by
  ) values(
    v_lead.organization_id,v_lead.id,v_lead.customer_id,v_contact.id,v_lead.site_id,p_quotation_type,p_starts_on,p_ends_on,
    case when p_quotation_type='rental' then p_operation_mode end,
    case when p_quotation_type='rental' then p_rental_operation_id end,
    case when p_quotation_type='rental' then nullif(trim(coalesce(p_proposed_operation_name,'')),'') end,
    p_purpose,nullif(trim(coalesce(p_other_purpose,'')),''),coalesce(p_discount_percent,0),
    nullif(trim(coalesce(p_discount_reason,'')),''),nullif(trim(coalesce(p_notes,'')),''),(select auth.uid())
  ) returning * into v_quote;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_line_no:=v_line_no+1;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid and organization_id=v_lead.organization_id and active;
    if v_product.id is null then raise exception 'Producto inválido en partida %',v_line_no; end if;
    select amount into v_price from public.product_prices where organization_id=v_lead.organization_id and product_id=v_product.id
      and quotation_type=p_quotation_type and active and valid_from<=p_starts_on and (valid_until is null or valid_until>=p_starts_on)
      order by valid_from desc limit 1;
    if v_price is null then raise exception 'No existe precio vigente para %',v_product.sku; end if;
    if coalesce((v_line->>'quantity')::numeric,0)<=0 then raise exception 'Cantidad inválida en %',v_product.sku; end if;
    v_start:=coalesce(nullif(v_line->>'starts_on','')::date,p_starts_on);
    v_end:=coalesce(nullif(v_line->>'ends_on','')::date,p_ends_on);
    v_factor:=null; v_floor_multiplier:=null; v_days:=null; v_floor:=0; v_unit:=v_price;
    if p_quotation_type='rental' and v_product.item_type='inventory' then
      if v_end is null or v_end<v_start then raise exception 'Fechas inválidas en %',v_product.sku; end if;
      v_days:=v_end-v_start+1;
      if v_days<5 then raise exception 'La partida % no cumple la renta mínima de 5 días',v_product.sku; end if;
      select rate_factor,floor_multiplier into v_factor,v_floor_multiplier from public.rental_rate_tiers
      where organization_id=v_lead.organization_id and active and valid_from<=v_start and (valid_until is null or valid_until>=v_start)
        and min_days<=v_days and (max_days is null or max_days>=v_days)
      order by valid_from desc,min_days desc limit 1;
      if v_factor is null then raise exception 'No existe factor de renta para % días',v_days; end if;
      v_floor:=round(v_price*v_floor_multiplier,2);
      v_unit:=greatest(round(v_price*v_days*v_factor,2),v_floor);
    end if;
    v_subtotal:=round((v_line->>'quantity')::numeric*v_unit,2);
    v_line_discount:=case when v_product.item_type='inventory' then round(v_subtotal*coalesce(p_discount_percent,0)/100,2) else 0 end;
    v_tax:=round((v_subtotal-v_line_discount)*.16,2);
    insert into public.quotation_lines(
      organization_id,quotation_id,line_no,product_id,sku_snapshot,description_snapshot,item_type,quantity,
      billing_unit,starts_on,ends_on,rental_days,base_unit_price,rate_factor,floor_amount,unit_price,
      subtotal,discount_amount,tax_amount,total
    ) values(
      v_lead.organization_id,v_quote.id,v_line_no,v_product.id,v_product.sku,v_product.description,v_product.item_type,(v_line->>'quantity')::numeric,
      case when p_quotation_type='rental' and v_product.item_type='inventory' then 'day' else 'fixed' end,
      v_start,v_end,v_days,v_price,v_factor,v_floor,v_unit,v_subtotal,v_line_discount,v_tax,v_subtotal-v_line_discount+v_tax
    );
  end loop;
  select * into v_quote from public.quotations where id=v_quote.id;
  return v_quote;
end;
$$;

create or replace function public.authorize_quotation_discount(p_quotation_id uuid)
returns public.quotations language plpgsql security invoker set search_path='' as $$
declare v_quote public.quotations;
begin
  select * into v_quote from public.quotations where id=p_quotation_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada'; end if;
  if not private.has_any_role(v_quote.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede autorizar el descuento' using errcode='42501'; end if;
  if v_quote.status<>'draft' or v_quote.discount_percent<=10 then raise exception 'El descuento no requiere autorización o la cotización ya fue emitida'; end if;
  update public.quotations set discount_authorized_by=(select auth.uid()),discount_authorized_at=now() where id=v_quote.id returning * into v_quote;
  return v_quote;
end;
$$;

create or replace function public.issue_quotation(p_quotation_id uuid)
returns public.quotations language plpgsql security invoker set search_path='' as $$
declare v_quote public.quotations; v_lead public.crm_leads;
begin
  select * into v_quote from public.quotations where id=p_quotation_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada'; end if;
  select * into v_lead from public.crm_leads where id=v_quote.lead_id for update;
  if not private.has_any_role(v_quote.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_quote.organization_id,array['commercial']::public.member_role[]) and v_quote.created_by=(select auth.uid())) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_quote.status<>'draft' then raise exception 'Sólo un borrador puede emitirse'; end if;
  if not exists(select 1 from public.quotation_lines where quotation_id=v_quote.id) then raise exception 'La cotización no tiene partidas'; end if;
  if v_quote.discount_percent>10 and v_quote.discount_authorized_at is null then raise exception 'El descuento mayor a 10%% requiere autorización'; end if;
  perform set_config('andavalle.quotation_action','issue_quotation',true);
  update public.quotations set status='sent',issued_at=now(),valid_until=current_date+15 where id=v_quote.id returning * into v_quote;
  perform set_config('andavalle.crm_action','issue_quotation',true);
  update public.crm_leads set status='quoted',quoted_at=coalesce(quoted_at,now()) where id=v_lead.id and status not in ('won','lost');
  return v_quote;
end;
$$;

create or replace function public.revise_quotation(p_quotation_id uuid)
returns public.quotations language plpgsql security invoker set search_path='' as $$
declare v_old public.quotations; v_new public.quotations; v_revision integer;
begin
  select * into v_old from public.quotations where id=p_quotation_id for update;
  if v_old.id is null or v_old.status not in ('sent','rejected','expired') or not v_old.is_current then raise exception 'La cotización no admite una revisión'; end if;
  if not private.has_any_role(v_old.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_old.organization_id,array['commercial']::public.member_role[]) and v_old.created_by=(select auth.uid())) then raise exception 'Sin permiso' using errcode='42501'; end if;
  select coalesce(max(revision_number),-1)+1 into v_revision from public.quotations where organization_id=v_old.organization_id and base_folio=v_old.base_folio;
  perform set_config('andavalle.quotation_action','revise_quotation',true);
  update public.quotations set is_current=false where id=v_old.id;
  insert into public.quotations(
    organization_id,lead_id,customer_id,contact_id,site_id,quotation_type,base_folio,revision_number,previous_revision_id,
    starts_on,ends_on,operation_mode,rental_operation_id,proposed_operation_name,purpose,other_purpose,
    discount_percent,discount_reason,notes,created_by
  ) values(
    v_old.organization_id,v_old.lead_id,v_old.customer_id,v_old.contact_id,v_old.site_id,v_old.quotation_type,v_old.base_folio,v_revision,v_old.id,
    v_old.starts_on,v_old.ends_on,v_old.operation_mode,v_old.rental_operation_id,v_old.proposed_operation_name,v_old.purpose,v_old.other_purpose,
    v_old.discount_percent,v_old.discount_reason,v_old.notes,(select auth.uid())
  ) returning * into v_new;
  insert into public.quotation_lines(
    organization_id,quotation_id,line_no,product_id,sku_snapshot,description_snapshot,item_type,quantity,billing_unit,
    starts_on,ends_on,rental_days,base_unit_price,rate_factor,floor_amount,unit_price,subtotal,discount_amount,tax_rate,tax_amount,total
  ) select organization_id,v_new.id,line_no,product_id,sku_snapshot,description_snapshot,item_type,quantity,billing_unit,
    starts_on,ends_on,rental_days,base_unit_price,rate_factor,floor_amount,unit_price,subtotal,discount_amount,tax_rate,tax_amount,total
  from public.quotation_lines where quotation_id=v_old.id order by line_no;
  select * into v_new from public.quotations where id=v_new.id; return v_new;
end;
$$;

create or replace function public.accept_quotation(p_quotation_id uuid,p_evidence_path text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_quote public.quotations; v_operation_id uuid; v_contract_id uuid;
begin
  select * into v_quote from public.quotations where id=p_quotation_id for update;
  if v_quote.id is null then raise exception 'Cotización no encontrada'; end if;
  if v_quote.status='converted' and v_quote.converted_contract_id is not null then
    return jsonb_build_object('quotation_id',v_quote.id,'contract_id',v_quote.converted_contract_id,'rental_operation_id',v_quote.rental_operation_id);
  end if;
  if not private.has_any_role(v_quote.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_quote.organization_id,array['commercial']::public.member_role[]) and v_quote.created_by=(select auth.uid())) then
    raise exception 'Sin permiso' using errcode='42501';
  end if;
  if v_quote.status<>'sent' or not v_quote.is_current then raise exception 'Sólo la revisión vigente y enviada puede aceptarse'; end if;
  if v_quote.valid_until<current_date then raise exception 'La cotización está vencida'; end if;
  if length(trim(coalesce(p_evidence_path,'')))<5 then raise exception 'Adjunta evidencia privada de aceptación'; end if;
  if p_evidence_path not like v_quote.organization_id::text||'/quotations/'||v_quote.id::text||'/%'
     or not exists(select 1 from storage.objects o where o.bucket_id='erp-documents' and o.name=p_evidence_path) then
    raise exception 'La evidencia no corresponde a un archivo privado de esta cotización';
  end if;
  if v_quote.quotation_type='rental' then
    if v_quote.operation_mode='existing' then v_operation_id:=v_quote.rental_operation_id;
    else
      insert into public.rental_operations(organization_id,customer_id,site_id,name,created_by)
      values(v_quote.organization_id,v_quote.customer_id,v_quote.site_id,v_quote.proposed_operation_name,(select auth.uid())) returning id into v_operation_id;
    end if;
  end if;
  perform set_config('andavalle.workflow_action','accept_quotation',true);
  insert into public.contracts(organization_id,customer_id,site_id,contract_type,status,starts_on,ends_on,notes,created_by,rental_operation_id)
  values(v_quote.organization_id,v_quote.customer_id,v_quote.site_id,v_quote.quotation_type,'draft',v_quote.starts_on,v_quote.ends_on,
    concat_ws(E'\n','Origen: '||v_quote.folio,v_quote.notes),(select auth.uid()),v_operation_id) returning id into v_contract_id;
  insert into public.contract_lines(
    organization_id,contract_id,line_no,product_id,quantity,unit_price,discount_percent,tax_rate,
    starts_on,ends_on,billing_unit,sku_snapshot,description_snapshot,base_unit_price,rate_factor
  ) select organization_id,v_contract_id,line_no,product_id,quantity,unit_price,
    case when item_type='inventory' then v_quote.discount_percent else 0 end,tax_rate,
    starts_on,ends_on,billing_unit,sku_snapshot,description_snapshot,base_unit_price,rate_factor
  from public.quotation_lines where quotation_id=v_quote.id order by line_no;
  perform set_config('andavalle.quotation_action','accept_quotation',true);
  update public.quotations set status='converted',acceptance_evidence_path=trim(p_evidence_path),accepted_at=now(),accepted_by=(select auth.uid()),
    converted_contract_id=v_contract_id,rental_operation_id=v_operation_id where id=v_quote.id;
  perform set_config('andavalle.crm_action','accept_quotation',true);
  update public.crm_leads set status='won',closed_at=now() where id=v_quote.lead_id;
  return jsonb_build_object('quotation_id',v_quote.id,'contract_id',v_contract_id,'rental_operation_id',v_operation_id);
end;
$$;

create trigger product_prices_audit after insert or update or delete on public.product_prices for each row execute function private.audit_row_change();
create trigger rental_rate_tiers_audit after insert or update or delete on public.rental_rate_tiers for each row execute function private.audit_row_change();
create trigger rental_operations_audit after insert or update or delete on public.rental_operations for each row execute function private.audit_row_change();
create trigger quotations_audit after insert or update or delete on public.quotations for each row execute function private.audit_row_change();
create trigger quotation_lines_audit after insert or update or delete on public.quotation_lines for each row execute function private.audit_row_change();

alter table public.product_prices enable row level security;
alter table public.rental_rate_tiers enable row level security;
alter table public.rental_operations enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_lines enable row level security;

create policy product_prices_read on public.product_prices for select to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy product_prices_admin_write on public.product_prices for all to authenticated using ((select private.has_any_role(organization_id,array['admin']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy rental_rate_tiers_read on public.rental_rate_tiers for select to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy rental_rate_tiers_admin_write on public.rental_rate_tiers for all to authenticated using ((select private.has_any_role(organization_id,array['admin']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy rental_operations_read on public.rental_operations for select to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[])));
create policy rental_operations_write on public.rental_operations for all to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy quotations_read on public.quotations for select to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy quotations_insert on public.quotations for insert to authenticated with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and created_by=(select auth.uid())));
create policy quotations_update on public.quotations for update to authenticated using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and created_by=(select auth.uid()))) with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and created_by=(select auth.uid())));
create policy quotation_lines_read on public.quotation_lines for select to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy quotation_lines_write on public.quotation_lines for all to authenticated using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));

create policy quotation_evidence_commercial_insert on storage.objects for insert to authenticated
with check (
  bucket_id='erp-documents' and (storage.foldername(name))[2]='quotations'
  and (select private.has_any_role(((storage.foldername(name))[1])::uuid,array['admin','commercial']::public.member_role[]))
  and exists(select 1 from public.quotations q where q.organization_id=((storage.foldername(name))[1])::uuid and q.id=((storage.foldername(name))[3])::uuid)
);

revoke all on public.product_prices,public.rental_rate_tiers,public.rental_operations,public.quotations,public.quotation_lines from anon,authenticated;
grant select on public.product_prices,public.rental_rate_tiers,public.rental_operations,public.quotations,public.quotation_lines to authenticated;
grant insert,update,delete on public.product_prices,public.rental_rate_tiers,public.rental_operations,public.quotations,public.quotation_lines to authenticated;

revoke execute on function private.seed_quotation_rules_for_organization(uuid) from public,anon,authenticated;
revoke execute on function public.create_quotation(uuid,uuid,public.contract_type,date,date,text,uuid,text,text,text,numeric,text,text,jsonb) from public,anon;
revoke execute on function public.authorize_quotation_discount(uuid) from public,anon;
revoke execute on function public.issue_quotation(uuid) from public,anon;
revoke execute on function public.revise_quotation(uuid) from public,anon;
revoke execute on function public.accept_quotation(uuid,text) from public,anon;
grant execute on function public.create_quotation(uuid,uuid,public.contract_type,date,date,text,uuid,text,text,text,numeric,text,text,jsonb),public.authorize_quotation_discount(uuid),public.issue_quotation(uuid),public.revise_quotation(uuid),public.accept_quotation(uuid,text) to authenticated;
