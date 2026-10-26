-- CRM ligero Andavalle: oportunidades, seguimiento, clientes, contactos y obras.

create table public.crm_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) between 2 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table public.crm_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) between 2 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table public.master_data_sequences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entity_code text not null check (entity_code in ('CLI','OBR')),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (organization_id, entity_code)
);

create or replace function private.seed_crm_catalogs_for_organization(p_organization_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.crm_sources(organization_id,code,name,sort_order) values
    (p_organization_id,'website','Sitio web',10),
    (p_organization_id,'manual','Captura manual',20),
    (p_organization_id,'referral','Recomendación',30),
    (p_organization_id,'repeat_customer','Cliente recurrente',40),
    (p_organization_id,'social','Redes sociales',50),
    (p_organization_id,'other','Otro',999)
  on conflict (organization_id,code) do nothing;

  insert into public.crm_loss_reasons(organization_id,code,name,sort_order) values
    (p_organization_id,'price','Precio',10),
    (p_organization_id,'timing','Fechas o plazo',20),
    (p_organization_id,'availability','Disponibilidad',30),
    (p_organization_id,'competitor','Eligió a otro proveedor',40),
    (p_organization_id,'no_response','Sin respuesta',50),
    (p_organization_id,'cancelled_project','Proyecto cancelado',60),
    (p_organization_id,'other','Otro',999)
  on conflict (organization_id,code) do nothing;
$$;

select private.seed_crm_catalogs_for_organization(id) from public.organizations;

create or replace function private.seed_crm_catalogs_on_organization_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_crm_catalogs_for_organization(new.id);
  return new;
end;
$$;

create trigger organizations_seed_crm_catalogs
after insert on public.organizations
for each row execute function private.seed_crm_catalogs_on_organization_insert();

alter table public.crm_leads rename column message to need_summary;
alter table public.crm_leads rename column converted_customer_id to customer_id;
alter table public.crm_leads alter column phone drop not null;
alter table public.crm_leads alter column status drop default;
alter table public.crm_leads alter column status type text using
  case status::text when 'converted' then 'won' when 'closed' then 'lost' else status::text end;
alter table public.crm_leads alter column status set default 'new';

alter table public.crm_leads
  add column site_id uuid,
  add column previous_lead_id uuid,
  add column source_id uuid,
  add column source_other text,
  add column lost_reason_id uuid,
  add column lost_notes text,
  add column duplicate_override_reason text,
  add column privacy_consent_at timestamptz,
  add column privacy_notice_version text,
  add column contacted_at timestamptz,
  add column qualified_at timestamptz,
  add column quoted_at timestamptz,
  add column closed_at timestamptz,
  add column archived_at timestamptz,
  add column created_by uuid references public.profiles(id) on delete restrict,
  add column phone_normalized text generated always as (regexp_replace(coalesce(phone,''),'[^0-9]+','','g')) stored,
  add column email_normalized text generated always as (lower(trim(coalesce(email,'')))) stored;

update public.crm_leads l
set source_id=s.id,
    source_other=case when s.code='other' then nullif(trim(l.source),'') end
from public.crm_sources s
where s.organization_id=l.organization_id
  and s.code=case when l.source in ('website','manual','referral','repeat_customer','social','other') then l.source else 'other' end;

alter table public.crm_leads drop column source;
alter table public.crm_leads alter column source_id set not null;
alter table public.crm_leads
  add constraint crm_leads_status_check check (status in ('new','contacted','qualified','quoted','won','lost')),
  add constraint crm_leads_contact_check check (nullif(phone_normalized,'') is not null or nullif(email_normalized,'') is not null),
  add constraint crm_leads_need_summary_check check (length(trim(need_summary)) between 10 and 2000),
  add constraint crm_leads_source_fk foreign key (organization_id,source_id) references public.crm_sources(organization_id,id) on delete restrict,
  add constraint crm_leads_loss_reason_fk foreign key (organization_id,lost_reason_id) references public.crm_loss_reasons(organization_id,id) on delete restrict,
  add constraint crm_leads_site_fk foreign key (organization_id,site_id) references public.customer_sites(organization_id,id) on delete restrict,
  add constraint crm_leads_previous_fk foreign key (organization_id,previous_lead_id) references public.crm_leads(organization_id,id) on delete restrict;

drop index if exists public.crm_leads_converted_customer_idx;
create index crm_leads_customer_idx on public.crm_leads(customer_id) where customer_id is not null;
create index crm_leads_site_idx on public.crm_leads(site_id) where site_id is not null;
create index crm_leads_phone_idx on public.crm_leads(organization_id,phone_normalized) where phone_normalized<>'' and archived_at is null;
create index crm_leads_email_idx on public.crm_leads(organization_id,email_normalized) where email_normalized<>'' and archived_at is null;
create index crm_leads_previous_idx on public.crm_leads(previous_lead_id) where previous_lead_id is not null;
create index crm_leads_open_pipeline_idx on public.crm_leads(organization_id,status,updated_at desc) where archived_at is null;

alter table public.customers
  add column person_type text not null default 'legal_entity' check (person_type in ('individual','legal_entity')),
  add column tax_id_normalized text generated always as (upper(regexp_replace(coalesce(tax_id,''),'[^A-Za-z0-9]+','','g'))) stored;

create unique index customers_active_tax_id_unique
on public.customers(organization_id,tax_id_normalized)
where archived_at is null and tax_id_normalized<>'';

alter table public.customer_sites
  add constraint customer_sites_org_customer_id_unique unique (organization_id,customer_id,id);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  site_id uuid,
  name text not null check (length(trim(name)) between 2 and 120),
  position text,
  phone text,
  email text,
  is_primary boolean not null default false,
  active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,customer_id) references public.customers(organization_id,id) on delete restrict,
  foreign key (organization_id,customer_id,site_id) references public.customer_sites(organization_id,customer_id,id) on delete restrict,
  check (nullif(trim(phone),'') is not null or nullif(trim(email),'') is not null)
);

create unique index customer_contacts_primary_unique
on public.customer_contacts(organization_id,customer_id)
where is_primary and active and archived_at is null;
create index customer_contacts_customer_idx on public.customer_contacts(customer_id) where archived_at is null;
create index customer_contacts_site_idx on public.customer_contacts(site_id) where site_id is not null and archived_at is null;

alter table public.customer_activities
  add column cancelled_at timestamptz,
  add column notes text,
  add column archived_at timestamptz,
  add column updated_at timestamptz not null default now();

update public.customer_activities set activity_type='task' where activity_type='follow_up';
alter table public.customer_activities
  add constraint customer_activities_type_check check (activity_type in ('call','email','whatsapp','visit','task','note')),
  add constraint customer_activities_due_check check (activity_type='note' or due_at is not null),
  add constraint customer_activities_close_check check (completed_at is null or cancelled_at is null);

create table public.crm_assignment_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid not null,
  previous_assignee uuid references public.profiles(id) on delete restrict,
  new_assignee uuid references public.profiles(id) on delete restrict,
  changed_by uuid references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,lead_id) references public.crm_leads(organization_id,id) on delete restrict
);

create index crm_assignment_history_lead_idx on public.crm_assignment_history(lead_id,created_at desc);
create index crm_sources_active_idx on public.crm_sources(organization_id,sort_order) where active;
create index crm_loss_reasons_active_idx on public.crm_loss_reasons(organization_id,sort_order) where active;

create or replace function private.next_master_code(p_organization_id uuid,p_entity_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_value bigint;
begin
  if p_entity_code not in ('CLI','OBR') then raise exception 'Código maestro no permitido'; end if;
  if (select auth.uid()) is not null and not private.user_in_organization(p_organization_id) then
    raise exception 'No pertenece a la organización' using errcode='42501';
  end if;
  insert into public.master_data_sequences(organization_id,entity_code,last_value)
  values(p_organization_id,p_entity_code,1)
  on conflict(organization_id,entity_code)
  do update set last_value=public.master_data_sequences.last_value+1
  returning last_value into v_value;
  return p_entity_code||'-'||lpad(v_value::text,6,'0');
end;
$$;

create or replace function private.prepare_customer_master_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(trim(new.customer_code),'') is null then
    new.customer_code:=private.next_master_code(new.organization_id,'CLI');
  end if;
  return new;
end;
$$;

create or replace function private.prepare_site_master_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if nullif(trim(new.site_code),'') is null then
    new.site_code:=private.next_master_code(new.organization_id,'OBR');
  end if;
  return new;
end;
$$;

create trigger customers_prepare_code before insert on public.customers
for each row execute function private.prepare_customer_master_code();
create trigger customer_sites_prepare_code before insert on public.customer_sites
for each row execute function private.prepare_site_master_code();

create or replace function private.validate_crm_lead()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_source text; v_loss text;
begin
  select code into v_source from public.crm_sources
  where organization_id=new.organization_id and id=new.source_id;
  if v_source is null then raise exception 'Origen comercial inválido'; end if;
  if v_source='other' and length(trim(coalesce(new.source_other,'')))<3 then
    raise exception 'Explica el origen comercial';
  end if;
  if v_source='website' and (new.privacy_consent_at is null or nullif(trim(new.privacy_notice_version),'') is null) then
    raise exception 'El prospecto web requiere consentimiento y versión del aviso';
  end if;
  if new.status='lost' then
    if new.lost_reason_id is null then raise exception 'La oportunidad perdida requiere motivo'; end if;
    select code into v_loss from public.crm_loss_reasons
    where organization_id=new.organization_id and id=new.lost_reason_id;
    if v_loss is null then raise exception 'Motivo de pérdida inválido'; end if;
    if v_loss='other' and length(trim(coalesce(new.lost_notes,'')))<3 then raise exception 'Explica el motivo de pérdida'; end if;
  elsif new.lost_reason_id is not null or new.lost_notes is not null then
    raise exception 'El motivo de pérdida sólo aplica al estado lost';
  end if;
  if new.site_id is not null and not exists(
    select 1 from public.customer_sites s where s.id=new.site_id and s.organization_id=new.organization_id and s.customer_id=new.customer_id
  ) then raise exception 'La obra no pertenece al cliente de la oportunidad'; end if;
  return new;
end;
$$;

create trigger crm_leads_validate before insert or update on public.crm_leads
for each row execute function private.validate_crm_lead();

create or replace function private.protect_crm_workflow()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status is distinct from new.status and coalesce(current_setting('andavalle.crm_action',true),'')='' then
    raise exception 'El estado sólo puede cambiar mediante una operación del CRM' using errcode='42501';
  end if;
  if old.assigned_to is distinct from new.assigned_to and coalesce(current_setting('andavalle.crm_assignment_reason',true),'')='' then
    raise exception 'La asignación sólo puede cambiar mediante una operación del CRM' using errcode='42501';
  end if;
  if (old.customer_id is distinct from new.customer_id or old.site_id is distinct from new.site_id)
     and coalesce(current_setting('andavalle.crm_customer_action',true),'')='' then
    raise exception 'El cliente y la obra sólo pueden vincularse mediante la conversión controlada' using errcode='42501';
  end if;
  if old.status in ('won','lost') and (
    old.name is distinct from new.name or old.company is distinct from new.company or
    old.phone is distinct from new.phone or old.email is distinct from new.email or
    old.need_summary is distinct from new.need_summary or old.customer_id is distinct from new.customer_id or
    old.site_id is distinct from new.site_id
  ) then raise exception 'Una oportunidad cerrada es inmutable' using errcode='42501'; end if;
  return new;
end;
$$;

create trigger crm_leads_protect_workflow before update on public.crm_leads
for each row execute function private.protect_crm_workflow();

create or replace function private.record_crm_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.assigned_to is distinct from new.assigned_to then
    insert into public.crm_assignment_history(organization_id,lead_id,previous_assignee,new_assignee,changed_by,reason)
    values(new.organization_id,new.id,old.assigned_to,new.assigned_to,(select auth.uid()),current_setting('andavalle.crm_assignment_reason'));
  end if;
  return new;
end;
$$;

create trigger crm_leads_assignment_history after update of assigned_to on public.crm_leads
for each row execute function private.record_crm_assignment();

create trigger customer_contacts_updated before update on public.customer_contacts
for each row execute function private.set_updated_at();
create trigger customer_activities_updated before update on public.customer_activities
for each row execute function private.set_updated_at();

create trigger customer_contacts_audit after insert or update or delete on public.customer_contacts
for each row execute function private.audit_row_change();
create trigger crm_sources_audit after insert or update or delete on public.crm_sources
for each row execute function private.audit_row_change();
create trigger crm_loss_reasons_audit after insert or update or delete on public.crm_loss_reasons
for each row execute function private.audit_row_change();
create trigger crm_assignment_history_audit after insert or update or delete on public.crm_assignment_history
for each row execute function private.audit_row_change();

create or replace function public.claim_crm_lead(p_lead_id uuid)
returns public.crm_leads
language plpgsql security invoker set search_path='' as $$
declare v_lead public.crm_leads;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if not private.has_any_role(v_lead.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  if v_lead.assigned_to is not null and v_lead.assigned_to<>(select auth.uid()) then raise exception 'La oportunidad ya fue asignada'; end if;
  perform set_config('andavalle.crm_assignment_reason','Autoasignación desde bandeja compartida',true);
  update public.crm_leads set assigned_to=(select auth.uid()) where id=p_lead_id returning * into v_lead;
  update public.customer_activities set assigned_to=(select auth.uid()) where lead_id=p_lead_id and assigned_to is null and completed_at is null and cancelled_at is null;
  return v_lead;
end;
$$;

create or replace function public.reassign_crm_lead(p_lead_id uuid,p_profile_id uuid,p_reason text)
returns public.crm_leads
language plpgsql security invoker set search_path='' as $$
declare v_lead public.crm_leads;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if not private.has_any_role(v_lead.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede reasignar' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de reasignación'; end if;
  if not exists(
    select 1 from public.organization_members m join public.organization_member_roles r using(organization_id,profile_id)
    where m.organization_id=v_lead.organization_id and m.profile_id=p_profile_id and m.active and r.role_code in ('admin','commercial')
  ) then raise exception 'El responsable no es un miembro comercial activo'; end if;
  perform set_config('andavalle.crm_assignment_reason',trim(p_reason),true);
  update public.crm_leads set assigned_to=p_profile_id where id=p_lead_id returning * into v_lead;
  update public.customer_activities set assigned_to=p_profile_id where lead_id=p_lead_id and completed_at is null and cancelled_at is null;
  return v_lead;
end;
$$;

create or replace function public.transition_crm_lead(p_lead_id uuid,p_status text,p_loss_reason_id uuid default null,p_loss_notes text default null)
returns public.crm_leads
language plpgsql security invoker set search_path='' as $$
declare v_lead public.crm_leads; v_allowed boolean:=false;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if not private.has_any_role(v_lead.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_lead.organization_id,array['commercial']::public.member_role[]) and v_lead.assigned_to=(select auth.uid())) then
    raise exception 'Sin permiso para cambiar la oportunidad' using errcode='42501';
  end if;
  v_allowed := (v_lead.status='new' and p_status in ('contacted','lost'))
    or (v_lead.status='contacted' and p_status in ('qualified','lost'))
    or (v_lead.status='qualified' and p_status='lost');
  if not v_allowed then raise exception 'Transición CRM no permitida: % → %',v_lead.status,p_status; end if;
  if p_status='contacted' and not exists(
    select 1 from public.customer_activities a where a.lead_id=v_lead.id and a.due_at>now() and a.completed_at is null and a.cancelled_at is null
  ) then raise exception 'Programa la siguiente actividad antes de marcar como contactada'; end if;
  perform set_config('andavalle.crm_action','transition_crm_lead',true);
  update public.crm_leads set
    status=p_status,
    contacted_at=case when p_status='contacted' then coalesce(contacted_at,now()) else contacted_at end,
    qualified_at=case when p_status='qualified' then coalesce(qualified_at,now()) else qualified_at end,
    closed_at=case when p_status='lost' then now() else null end,
    lost_reason_id=case when p_status='lost' then p_loss_reason_id else null end,
    lost_notes=case when p_status='lost' then nullif(trim(coalesce(p_loss_notes,'')),'') else null end
  where id=p_lead_id returning * into v_lead;
  return v_lead;
end;
$$;

create or replace function public.clone_lost_crm_lead(p_lead_id uuid)
returns public.crm_leads
language plpgsql security invoker set search_path='' as $$
declare v_old public.crm_leads; v_new public.crm_leads; v_source uuid;
begin
  select * into v_old from public.crm_leads where id=p_lead_id;
  if v_old.id is null or v_old.status<>'lost' then raise exception 'Sólo puede retomarse una oportunidad perdida'; end if;
  if not private.has_any_role(v_old.organization_id,array['admin','commercial']::public.member_role[]) then raise exception 'Sin permiso' using errcode='42501'; end if;
  select id into v_source from public.crm_sources where organization_id=v_old.organization_id and code='repeat_customer';
  insert into public.crm_leads(organization_id,name,company,phone,email,need_summary,source_id,assigned_to,customer_id,site_id,previous_lead_id,created_by)
  values(v_old.organization_id,v_old.name,v_old.company,v_old.phone,v_old.email,v_old.need_summary,v_source,(select auth.uid()),v_old.customer_id,v_old.site_id,v_old.id,(select auth.uid()))
  returning * into v_new;
  return v_new;
end;
$$;

create or replace function public.create_crm_customer(
  p_lead_id uuid,
  p_person_type text,
  p_legal_name text,
  p_trade_name text,
  p_tax_id text,
  p_contact_name text,
  p_contact_position text,
  p_contact_phone text,
  p_contact_email text,
  p_site_name text,
  p_site_address text
)
returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_lead public.crm_leads; v_customer public.customers; v_site public.customer_sites; v_contact public.customer_contacts;
begin
  select * into v_lead from public.crm_leads where id=p_lead_id for update;
  if v_lead.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if v_lead.customer_id is not null then raise exception 'La oportunidad ya tiene cliente'; end if;
  if not private.has_any_role(v_lead.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_lead.organization_id,array['commercial']::public.member_role[]) and v_lead.assigned_to=(select auth.uid())) then
    raise exception 'Sin permiso para convertir la oportunidad' using errcode='42501';
  end if;
  if p_person_type not in ('individual','legal_entity') then raise exception 'Tipo de persona inválido'; end if;
  if length(trim(coalesce(p_legal_name,'')))<2 then raise exception 'Nombre o razón social requerido'; end if;
  if length(trim(coalesce(p_contact_name,'')))<2 or (nullif(trim(coalesce(p_contact_phone,'')),'') is null and nullif(trim(coalesce(p_contact_email,'')),'') is null) then
    raise exception 'Contacto incompleto';
  end if;
  if length(trim(coalesce(p_site_name,'')))<2 or length(trim(coalesce(p_site_address,'')))<5 then raise exception 'Obra y dirección requeridas'; end if;
  if nullif(regexp_replace(upper(coalesce(p_tax_id,'')),'[^A-Z0-9]+','','g'),'') is not null and exists(
    select 1 from public.customers c where c.organization_id=v_lead.organization_id and c.archived_at is null
      and c.tax_id_normalized=regexp_replace(upper(p_tax_id),'[^A-Z0-9]+','','g')
  ) then raise exception 'Ya existe un cliente activo con ese RFC'; end if;

  insert into public.customers(organization_id,customer_code,person_type,legal_name,trade_name,tax_id,phone,email)
  values(v_lead.organization_id,'',p_person_type,trim(p_legal_name),nullif(trim(coalesce(p_trade_name,'')),''),nullif(trim(coalesce(p_tax_id,'')),''),nullif(trim(coalesce(p_contact_phone,'')),''),nullif(lower(trim(coalesce(p_contact_email,''))),''))
  returning * into v_customer;
  insert into public.customer_sites(organization_id,customer_id,site_code,name,address,contact_name,contact_phone)
  values(v_lead.organization_id,v_customer.id,'',trim(p_site_name),trim(p_site_address),trim(p_contact_name),nullif(trim(coalesce(p_contact_phone,'')),''))
  returning * into v_site;
  insert into public.customer_contacts(organization_id,customer_id,site_id,name,position,phone,email,is_primary,created_by)
  values(v_lead.organization_id,v_customer.id,v_site.id,trim(p_contact_name),nullif(trim(coalesce(p_contact_position,'')),''),nullif(trim(coalesce(p_contact_phone,'')),''),nullif(lower(trim(coalesce(p_contact_email,''))),''),true,(select auth.uid()))
  returning * into v_contact;
  perform set_config('andavalle.crm_customer_action','create_crm_customer',true);
  update public.crm_leads set customer_id=v_customer.id,site_id=v_site.id where id=v_lead.id;
  return jsonb_build_object('customer_id',v_customer.id,'customer_code',v_customer.customer_code,'site_id',v_site.id,'site_code',v_site.site_code,'contact_id',v_contact.id);
end;
$$;

create or replace function public.create_website_crm_lead(
  p_organization_id uuid,
  p_name text,
  p_company text,
  p_phone text,
  p_email text,
  p_need_summary text,
  p_privacy_notice_version text
)
returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_source uuid; v_lead_id uuid;
begin
  select id into v_source
  from public.crm_sources
  where organization_id=p_organization_id and code='website' and active;
  if v_source is null then raise exception 'El origen website no está disponible'; end if;

  insert into public.crm_leads(
    organization_id,name,company,phone,email,need_summary,source_id,
    privacy_consent_at,privacy_notice_version
  ) values(
    p_organization_id,trim(p_name),nullif(trim(coalesce(p_company,'')),''),
    nullif(trim(coalesce(p_phone,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),
    trim(p_need_summary),v_source,now(),trim(p_privacy_notice_version)
  ) returning id into v_lead_id;

  insert into public.customer_activities(organization_id,lead_id,activity_type,summary,due_at)
  values(p_organization_id,v_lead_id,'task','Contactar prospecto del sitio web',now()+interval '24 hours');
  return v_lead_id;
end;
$$;

drop policy if exists leads_commercial_write on public.crm_leads;
drop policy if exists crm_leads_org_read on public.crm_leads;
drop policy if exists activities_commercial_write on public.customer_activities;
drop policy if exists customer_activities_org_read on public.customer_activities;

alter table public.crm_sources enable row level security;
alter table public.crm_loss_reasons enable row level security;
alter table public.crm_assignment_history enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.master_data_sequences enable row level security;

create policy crm_leads_read on public.crm_leads for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy crm_leads_insert on public.crm_leads for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and assigned_to=(select auth.uid())));
create policy crm_leads_update on public.crm_leads for update to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and (assigned_to=(select auth.uid()) or assigned_to is null)))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or ((select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and assigned_to=(select auth.uid())));

create policy customer_activities_read on public.customer_activities for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy customer_activities_insert on public.customer_activities for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or (
  (select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and created_by=(select auth.uid()) and assigned_to=(select auth.uid())
));
create policy customer_activities_update on public.customer_activities for update to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or (
  (select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and (
    assigned_to=(select auth.uid()) or (
      assigned_to is null and exists(select 1 from public.crm_leads l where l.id=lead_id and l.assigned_to=(select auth.uid()))
    )
  )
))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])) or (
  (select private.has_any_role(organization_id,array['commercial']::public.member_role[])) and assigned_to=(select auth.uid())
));

create policy crm_sources_read on public.crm_sources for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy crm_sources_admin_write on public.crm_sources for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy crm_sources_admin_update on public.crm_sources for update to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));

create policy crm_loss_reasons_read on public.crm_loss_reasons for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy crm_loss_reasons_admin_write on public.crm_loss_reasons for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy crm_loss_reasons_admin_update on public.crm_loss_reasons for update to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));

create policy crm_assignment_history_read on public.crm_assignment_history for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));

create policy customer_contacts_read on public.customer_contacts for select to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy customer_contacts_insert on public.customer_contacts for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy customer_contacts_update on public.customer_contacts for update to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])))
with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));

revoke all on public.crm_sources,public.crm_loss_reasons,public.crm_assignment_history,public.customer_contacts,public.master_data_sequences from anon,authenticated;
grant select on public.crm_sources,public.crm_loss_reasons,public.crm_assignment_history,public.customer_contacts to authenticated;
grant insert,update on public.crm_sources,public.crm_loss_reasons,public.customer_contacts to authenticated;
grant select on public.crm_sources to service_role;
grant insert on public.crm_leads,public.customer_activities to service_role;
revoke delete on public.crm_leads,public.customer_activities,public.customers,public.customer_sites from authenticated;
grant select,insert,update on public.crm_leads,public.customer_activities to authenticated;

revoke execute on function private.seed_crm_catalogs_for_organization(uuid) from public,anon,authenticated;
revoke execute on function private.next_master_code(uuid,text) from public,anon,authenticated;
revoke execute on function public.claim_crm_lead(uuid) from public,anon;
revoke execute on function public.reassign_crm_lead(uuid,uuid,text) from public,anon;
revoke execute on function public.transition_crm_lead(uuid,text,uuid,text) from public,anon;
revoke execute on function public.clone_lost_crm_lead(uuid) from public,anon;
revoke execute on function public.create_crm_customer(uuid,text,text,text,text,text,text,text,text,text,text) from public,anon;
revoke execute on function public.create_website_crm_lead(uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_crm_lead(uuid),public.reassign_crm_lead(uuid,uuid,text),public.transition_crm_lead(uuid,text,uuid,text),public.clone_lost_crm_lead(uuid),public.create_crm_customer(uuid,text,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_website_crm_lead(uuid,text,text,text,text,text,text) to service_role;
