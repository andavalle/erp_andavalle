-- Datos ficticios y repetibles para desarrollo. No ejecutar en producción.
insert into public.organizations(id,name,legal_name)
values('10000000-0000-0000-0000-000000000001','Andavalle','Andavalle S.A. de C.V.')
on conflict(id) do nothing;

insert into public.branches(id,organization_id,code,name)
values('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','LERMA','Lerma')
on conflict(id) do nothing;

insert into public.warehouses(id,organization_id,branch_id,code,name)
values('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','ALM-01','Almacén principal')
on conflict(id) do nothing;

insert into public.inventory_locations(id,organization_id,warehouse_id,code,name,location_type) values
('13000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','DISP','Disponible','available'),
('13000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','INSP','Inspección','inspection'),
('13000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','MANT','Mantenimiento','maintenance'),
('13000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','DANO','Dañado','damaged'),
('13000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','VENTA','Vendido','sold'),
('13000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','BAJA','Baja','writeoff')
on conflict(id) do nothing;

insert into public.products(id,organization_id,sku,description,family,unit_of_measure,weight_kg) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','MC-200','Marco convencional 2.00 m','Convencional','pieza',18.500),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','CR-250','Cruceta 2.50 m','Convencional','pieza',7.200),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','PL-300','Plataforma 3.00 m','Plataformas','pieza',24.000)
on conflict(id) do nothing;

insert into public.inventory_movements(id,organization_id,product_id,to_location_id,quantity,movement_kind) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001',300,'opening_balance'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000001',600,'opening_balance'),
('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','13000000-0000-0000-0000-000000000001',180,'opening_balance')
on conflict(id) do nothing;

insert into public.customers(id,organization_id,customer_code,person_type,legal_name,trade_name,tax_id,phone,email) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','CLI-000001','legal_entity','Constructora Valle Alto S.A. de C.V.','Valle Alto','CVA010101AA1','7225550101','compras@vallealto.test'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','CLI-000002','legal_entity','Proyectos Lerma S.A. de C.V.','Proyectos Lerma','PLE020202BB2','7225550202','obra@proyectoslerma.test')
on conflict(id) do nothing;

insert into public.customer_sites(id,organization_id,customer_id,site_code,name,address,contact_name,contact_phone) values
('41000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','OBR-000001','Nave Norte','Parque Industrial Lerma, Estado de México','Ana Torres','7225550101'),
('41000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','OBR-000002','Edificio B','Toluca, Estado de México','Luis Rojas','7225550202')
on conflict(id) do nothing;

insert into public.customer_contacts(id,organization_id,customer_id,site_id,name,position,phone,email,is_primary) values
('42000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Ana Torres','Residente de obra','7225550101','ana@vallealto.test',true),
('42000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000002','Luis Rojas','Compras','7225550202','luis@proyectoslerma.test',true)
on conflict(id) do nothing;

insert into public.master_data_sequences(organization_id,entity_code,last_value) values
('10000000-0000-0000-0000-000000000001','CLI',2),
('10000000-0000-0000-0000-000000000001','OBR',2)
on conflict(organization_id,entity_code) do update set last_value=greatest(public.master_data_sequences.last_value,excluded.last_value);

insert into public.crm_leads(id,organization_id,status,name,company,phone,email,need_summary,source_id,customer_id,site_id) values
('43000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','new','Carlos Mendoza','Constructora Horizonte','7225550303','carlos@horizonte.test','Requiere cotización de andamio para una nave industrial.',(select id from public.crm_sources where organization_id='10000000-0000-0000-0000-000000000001' and code='manual'),null,null),
('43000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','qualified','Ana Torres','Valle Alto','7225550101','ana@vallealto.test','Solicita equipo adicional para un nuevo frente dentro de la obra.',(select id from public.crm_sources where organization_id='10000000-0000-0000-0000-000000000001' and code='repeat_customer'),'40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001')
on conflict(id) do nothing;

insert into public.customer_activities(id,organization_id,lead_id,customer_id,site_id,activity_type,summary,due_at) values
('44000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000001',null,null,'call','Confirmar medidas y fecha de inicio',now()+interval '1 day'),
('44000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','43000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','visit','Revisar frente adicional en obra',now()+interval '2 days')
on conflict(id) do nothing;

insert into public.products(id,organization_id,sku,description,family,unit_of_measure,item_type) values
('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','SRV-FLETE','Servicio de flete local','Servicios','servicio','service')
on conflict(id) do update set item_type=excluded.item_type;

insert into public.product_prices(id,organization_id,product_id,quotation_type,amount,valid_from) values
('21000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','rental',12.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','rental',5.50,'2026-01-01'),
('21000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','rental',16.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','rental',2500.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','sale',1450.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','sale',620.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','sale',2100.00,'2026-01-01'),
('21000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004','sale',2500.00,'2026-01-01')
on conflict(id) do nothing;
