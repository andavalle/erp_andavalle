-- Borrador de arquitectura: no ejecutar todavía en producción.
-- SS/SE son solicitudes editables; HS/HE son documentos confirmados que generan movimientos.

create type public.member_role as enum ('admin', 'commercial', 'warehouse', 'logistics');
create type public.request_type as enum ('SS', 'SE');
create type public.inventory_document_type as enum ('HS', 'HE');
create type public.request_status as enum ('draft', 'submitted', 'preparing', 'ready', 'converted', 'cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role_code public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_code text not null,
  legal_name text not null,
  trade_name text,
  phone text,
  email text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);

create table public.customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_code text not null,
  name text not null,
  address text,
  contact_name text,
  contact_phone text,
  archived_at timestamptz,
  unique (customer_id, site_code)
);

create table public.customer_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid references public.customer_sites(id) on delete restrict,
  activity_type text not null,
  summary text not null,
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
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
  unique (organization_id, sku)
);

create table public.operation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_type public.request_type not null,
  folio text not null,
  status public.request_status not null default 'draft',
  customer_id uuid not null references public.customers(id) on delete restrict,
  site_id uuid not null references public.customer_sites(id) on delete restrict,
  requested_at timestamptz not null default now(),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  notes text,
  unique (organization_id, request_type, folio)
);

create table public.operation_request_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.operation_requests(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unique (request_id, line_no)
);

-- Las tablas de contratos, HS/HE y ledger se agregarán después de validar estados y folios.
-- Toda tabla expuesta deberá tener RLS, políticas por organization_members y GRANT explícitos.
