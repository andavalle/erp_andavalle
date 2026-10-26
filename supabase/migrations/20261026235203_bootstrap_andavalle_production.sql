-- Configuración maestra productiva. No incluye catálogo, clientes ni existencias.
insert into public.organizations(id,name,legal_name,timezone,active)
values(
  '10000000-0000-0000-0000-000000000001',
  'Andavalle',
  'Andavalle S.A. de C.V.',
  'America/Mexico_City',
  true
)
on conflict(id) do update set
  name=excluded.name,
  legal_name=excluded.legal_name,
  timezone=excluded.timezone,
  active=excluded.active;

insert into public.branches(id,organization_id,code,name,active)
values(
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'LERMA',
  'Sucursal Lerma',
  true
)
on conflict(id) do update set
  code=excluded.code,
  name=excluded.name,
  active=excluded.active;

insert into public.warehouses(id,organization_id,branch_id,code,name,active)
values(
  '12000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'ALM-01',
  'Almacén principal',
  true
)
on conflict(id) do update set
  branch_id=excluded.branch_id,
  code=excluded.code,
  name=excluded.name,
  active=excluded.active;

insert into public.inventory_locations(
  id,organization_id,warehouse_id,code,name,location_type,active
) values
  ('13000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','DISP','Disponible','available',true),
  ('13000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','INSP','Inspección','inspection',true),
  ('13000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','MANT','Mantenimiento','maintenance',true),
  ('13000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','DANO','Dañado','damaged',true),
  ('13000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','VENTA','Vendido','sold',true),
  ('13000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','BAJA','Baja','writeoff',true)
on conflict(id) do update set
  warehouse_id=excluded.warehouse_id,
  code=excluded.code,
  name=excluded.name,
  location_type=excluded.location_type,
  active=excluded.active;
