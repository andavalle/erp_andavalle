create schema if not exists private;
revoke all on schema private from public, anon;

create type public.member_role as enum ('admin', 'commercial', 'warehouse', 'logistics');
create type public.contract_type as enum ('rental', 'sale');
create type public.contract_status as enum ('draft', 'pending_authorization', 'authorized', 'active', 'closed', 'cancelled');
create type public.request_type as enum ('SS', 'SE');
create type public.request_status as enum ('draft', 'submitted', 'authorized', 'partially_fulfilled', 'completed', 'cancelled');
create type public.inventory_document_type as enum ('HS', 'HE');
create type public.inventory_document_status as enum ('draft', 'confirmed', 'reversed', 'cancelled');
create type public.location_type as enum ('available', 'inspection', 'maintenance', 'damaged', 'customer', 'sold', 'writeoff');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'converted', 'closed');
create type public.logistics_status as enum ('planned', 'assigned', 'in_transit', 'completed', 'cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'America/Mexico_City',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table public.organization_member_roles (
  organization_id uuid not null,
  profile_id uuid not null,
  role_code public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id, role_code),
  foreign key (organization_id, profile_id)
    references public.organization_members(organization_id, profile_id) on delete cascade
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, branch_id) references public.branches(organization_id, id) on delete restrict
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_code text not null,
  legal_name text not null,
  trade_name text,
  tax_id text,
  phone text,
  email text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_code),
  unique (organization_id, id)
);

create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  site_code text not null,
  name text not null,
  address text,
  contact_name text,
  contact_phone text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, site_code),
  unique (organization_id, id),
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict
);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status public.lead_status not null default 'new',
  name text not null,
  company text,
  phone text not null,
  email text,
  message text not null,
  source text not null default 'website',
  assigned_to uuid references public.profiles(id) on delete restrict,
  converted_customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, converted_customer_id) references public.customers(organization_id, id) on delete restrict
);

create table public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lead_id uuid,
  customer_id uuid,
  site_id uuid,
  activity_type text not null,
  summary text not null,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (lead_id is not null or customer_id is not null),
  foreign key (organization_id, lead_id) references public.crm_leads(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id) references public.customer_sites(organization_id, id) on delete restrict
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sku text not null,
  description text not null,
  family text,
  unit_of_measure text not null default 'pieza',
  weight_kg numeric(12,3) check (weight_kg is null or weight_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, id)
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid,
  customer_site_id uuid,
  code text not null,
  name text not null,
  location_type public.location_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, warehouse_id) references public.warehouses(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_site_id) references public.customer_sites(organization_id, id) on delete restrict,
  check (
    (location_type = 'customer' and customer_site_id is not null and warehouse_id is null)
    or (location_type <> 'customer' and customer_site_id is null)
  )
);

create table public.contract_chains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_chain_id uuid not null,
  previous_contract_id uuid,
  customer_id uuid not null,
  site_id uuid not null,
  contract_type public.contract_type not null,
  folio text,
  status public.contract_status not null default 'draft',
  starts_on date not null,
  ends_on date,
  currency text not null default 'MXN' check (currency = 'MXN'),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  authorized_by uuid references public.profiles(id) on delete restrict,
  authorized_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio),
  unique (organization_id, id),
  foreign key (organization_id, contract_chain_id) references public.contract_chains(organization_id, id) on delete restrict,
  foreign key (organization_id, previous_contract_id) references public.contracts(organization_id, id) on delete restrict,
  foreign key (organization_id, customer_id) references public.customers(organization_id, id) on delete restrict,
  foreign key (organization_id, site_id) references public.customer_sites(organization_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on),
  check (discount_amount <= subtotal),
  check (total = subtotal - discount_amount + tax_amount)
);

create table public.contract_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contract_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  tax_rate numeric(5,4) not null default 0.16 check (tax_rate between 0 and 1),
  unique (contract_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, contract_id) references public.contracts(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict
);

create table public.operation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_id uuid not null,
  request_type public.request_type not null,
  folio text,
  status public.request_status not null default 'draft',
  requested_at timestamptz not null default now(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  authorized_by uuid references public.profiles(id) on delete restrict,
  authorized_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, folio),
  unique (organization_id, id),
  foreign key (organization_id, contract_id) references public.contracts(organization_id, id) on delete restrict
);

create table public.operation_request_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  contract_line_id uuid,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unique (request_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, request_id) references public.operation_requests(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict,
  foreign key (organization_id, contract_line_id) references public.contract_lines(organization_id, id) on delete restrict
);

create table public.logistics_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  status public.logistics_status not null default 'planned',
  scheduled_for timestamptz,
  vehicle text,
  operator_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id),
  foreign key (organization_id, request_id) references public.operation_requests(organization_id, id) on delete restrict
);

create table public.inventory_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  document_type public.inventory_document_type not null,
  folio text,
  status public.inventory_document_status not null default 'draft',
  idempotency_key uuid not null default gen_random_uuid(),
  receiver_name text,
  signature_path text,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  unique (organization_id, folio),
  unique (organization_id, id),
  unique (idempotency_key),
  foreign key (organization_id, request_id) references public.operation_requests(organization_id, id) on delete restrict
);

create table public.inventory_document_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  request_line_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_id uuid not null,
  from_location_id uuid,
  to_location_id uuid,
  quantity numeric(14,3) not null check (quantity > 0),
  unique (document_id, line_no),
  unique (organization_id, id),
  foreign key (organization_id, document_id) references public.inventory_documents(organization_id, id) on delete restrict,
  foreign key (organization_id, request_line_id) references public.operation_request_lines(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict,
  foreign key (organization_id, from_location_id) references public.inventory_locations(organization_id, id) on delete restrict,
  foreign key (organization_id, to_location_id) references public.inventory_locations(organization_id, id) on delete restrict,
  check (from_location_id is distinct from to_location_id)
);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_line_id uuid not null,
  product_id uuid not null,
  location_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  consumed_quantity numeric(14,3) not null default 0 check (consumed_quantity >= 0 and consumed_quantity <= quantity),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique (request_line_id, location_id),
  foreign key (organization_id, request_line_id) references public.operation_request_lines(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict,
  foreign key (organization_id, location_id) references public.inventory_locations(organization_id, id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contract_chain_id uuid,
  document_id uuid,
  product_id uuid not null,
  from_location_id uuid,
  to_location_id uuid,
  quantity numeric(14,3) not null check (quantity > 0),
  movement_kind text not null,
  reversal_of_id uuid,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (from_location_id is not null or to_location_id is not null),
  check (from_location_id is distinct from to_location_id),
  unique (reversal_of_id),
  unique (organization_id, id),
  foreign key (organization_id, document_id) references public.inventory_documents(organization_id, id) on delete restrict,
  foreign key (organization_id, contract_chain_id) references public.contract_chains(organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products(organization_id, id) on delete restrict,
  foreign key (organization_id, from_location_id) references public.inventory_locations(organization_id, id) on delete restrict,
  foreign key (organization_id, to_location_id) references public.inventory_locations(organization_id, id) on delete restrict,
  foreign key (organization_id, reversal_of_id) references public.inventory_movements(organization_id, id) on delete restrict
);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null,
  storage_path text not null unique,
  file_kind text not null check (file_kind in ('signature', 'photo', 'pdf')),
  content_type text not null,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (organization_id, document_id) references public.inventory_documents(organization_id, id) on delete restrict
);

create table public.document_sequences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_code text not null,
  sequence_year integer not null check (sequence_year between 2020 and 2200),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (organization_id, document_code, sequence_year)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_profile_idx on public.organization_members(profile_id) where active;
create index member_roles_profile_idx on public.organization_member_roles(profile_id, organization_id);
create index customers_active_name_idx on public.customers(organization_id, legal_name) where archived_at is null;
create index customer_sites_customer_idx on public.customer_sites(customer_id) where archived_at is null;
create index crm_leads_status_created_idx on public.crm_leads(organization_id, status, created_at desc);
create index customer_activities_due_idx on public.customer_activities(organization_id, due_at) where completed_at is null;
create index products_active_family_idx on public.products(organization_id, family) where active;
create index locations_org_type_idx on public.inventory_locations(organization_id, location_type) where active;
create index contracts_customer_status_idx on public.contracts(organization_id, customer_id, status);
create index contracts_chain_idx on public.contracts(contract_chain_id, created_at);
create index contract_lines_product_idx on public.contract_lines(product_id);
create index requests_contract_status_idx on public.operation_requests(contract_id, status);
create index request_lines_product_idx on public.operation_request_lines(product_id);
create index documents_request_status_idx on public.inventory_documents(request_id, status);
create index document_lines_product_idx on public.inventory_document_lines(product_id);
create index reservations_active_product_idx on public.stock_reservations(organization_id, product_id, location_id) where released_at is null;
create index movements_product_location_idx on public.inventory_movements(organization_id, product_id, created_at);
create index movements_chain_product_idx on public.inventory_movements(contract_chain_id, product_id, created_at) where contract_chain_id is not null;
create index movements_from_location_idx on public.inventory_movements(from_location_id) where from_location_id is not null;
create index movements_to_location_idx on public.inventory_movements(to_location_id) where to_location_id is not null;
create index audit_org_created_idx on public.audit_events(organization_id, created_at desc);
create index warehouses_branch_idx on public.warehouses(branch_id);
create index crm_leads_assigned_idx on public.crm_leads(assigned_to) where assigned_to is not null;
create index crm_leads_converted_customer_idx on public.crm_leads(converted_customer_id) where converted_customer_id is not null;
create index customer_activities_lead_idx on public.customer_activities(lead_id) where lead_id is not null;
create index customer_activities_customer_idx on public.customer_activities(customer_id) where customer_id is not null;
create index customer_activities_site_idx on public.customer_activities(site_id) where site_id is not null;
create index inventory_locations_warehouse_idx on public.inventory_locations(warehouse_id) where warehouse_id is not null;
create index inventory_locations_customer_site_idx on public.inventory_locations(customer_site_id) where customer_site_id is not null;
create index contracts_previous_idx on public.contracts(previous_contract_id) where previous_contract_id is not null;
create index contracts_site_idx on public.contracts(site_id);
create index request_lines_contract_line_idx on public.operation_request_lines(contract_line_id) where contract_line_id is not null;
create index document_lines_request_line_idx on public.inventory_document_lines(request_line_id);
create index document_lines_from_location_idx on public.inventory_document_lines(from_location_id) where from_location_id is not null;
create index document_lines_to_location_idx on public.inventory_document_lines(to_location_id) where to_location_id is not null;
create index movements_document_idx on public.inventory_movements(document_id) where document_id is not null;
create index document_files_document_idx on public.document_files(document_id);

create view public.inventory_balances with (security_invoker = true) as
select organization_id, product_id, location_id, sum(delta)::numeric(14,3) as quantity
from (
  select organization_id, product_id, to_location_id as location_id, quantity as delta
  from public.inventory_movements where to_location_id is not null
  union all
  select organization_id, product_id, from_location_id as location_id, -quantity as delta
  from public.inventory_movements where from_location_id is not null
) movements
group by organization_id, product_id, location_id;

create view public.inventory_availability with (security_invoker = true) as
select b.organization_id, b.product_id, b.location_id, b.quantity as on_hand,
       coalesce(r.reserved, 0)::numeric(14,3) as reserved,
       (b.quantity - coalesce(r.reserved, 0))::numeric(14,3) as available
from public.inventory_balances b
join public.inventory_locations l on l.id = b.location_id and l.location_type = 'available'
left join (
  select organization_id, product_id, location_id,
         sum(quantity - consumed_quantity)::numeric(14,3) as reserved
  from public.stock_reservations where released_at is null
  group by organization_id, product_id, location_id
) r on r.organization_id=b.organization_id and r.product_id=b.product_id and r.location_id=b.location_id;
