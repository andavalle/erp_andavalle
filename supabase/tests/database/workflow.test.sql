begin;
select plan(1);

do $$
declare
  v_org constant uuid := '10000000-0000-0000-0000-000000000001';
  v_user uuid := gen_random_uuid();
  v_customer uuid;
  v_site uuid;
  v_customer_location uuid;
  v_product uuid;
  v_available_location uuid;
  v_contract uuid;
  v_contract_line uuid;
  v_ss uuid;
  v_ss_line uuid;
  v_hs uuid;
  v_se uuid;
  v_se_line uuid;
  v_he uuid;
  v_value numeric;
  v_status text;
begin
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  insert into auth.users(id,email,raw_user_meta_data) values(v_user,'admin@andavalle.test','{"display_name":"Admin prueba"}'::jsonb);
  insert into public.organization_members(organization_id,profile_id) values(v_org,v_user);
  insert into public.organization_member_roles(organization_id,profile_id,role_code) values(v_org,v_user,'admin');

  select id into v_product from public.products where organization_id=v_org order by sku limit 1;
  select id into v_available_location from public.inventory_locations where organization_id=v_org and location_type='available' limit 1;
  insert into public.customers(organization_id,customer_code,legal_name) values(v_org,'CLI-TEST','Cliente de prueba') returning id into v_customer;
  insert into public.customer_sites(organization_id,customer_id,site_code,name) values(v_org,v_customer,'OBRA-TEST','Obra de prueba') returning id into v_site;
  insert into public.inventory_locations(organization_id,customer_site_id,code,name,location_type)
  values(v_org,v_site,'CLIENTE-TEST','Custodia cliente prueba','customer') returning id into v_customer_location;

  insert into public.contracts(organization_id,customer_id,site_id,contract_type,starts_on,created_by)
  values(v_org,v_customer,v_site,'rental',current_date,v_user) returning id into v_contract;
  insert into public.contract_lines(organization_id,contract_id,line_no,product_id,quantity,unit_price)
  values(v_org,v_contract,1,v_product,10,100) returning id into v_contract_line;
  select total into v_value from public.contracts where id=v_contract;
  if v_value<>1160 then raise exception 'Total contractual incorrecto: %',v_value; end if;
  perform public.submit_contract(v_contract);
  perform public.authorize_contract(v_contract,'Autorización propia para prueba integral');

  insert into public.operation_requests(organization_id,contract_id,request_type,requested_by)
  values(v_org,v_contract,'SS',v_user) returning id into v_ss;
  insert into public.operation_request_lines(organization_id,request_id,contract_line_id,line_no,product_id,quantity)
  values(v_org,v_ss,v_contract_line,1,v_product,5) returning id into v_ss_line;
  perform public.submit_request(v_ss);
  perform public.authorize_request(v_ss);
  select quantity-consumed_quantity into v_value from public.stock_reservations where request_line_id=v_ss_line;
  if v_value<>5 then raise exception 'Reserva incorrecta: %',v_value; end if;

  insert into public.inventory_documents(organization_id,request_id,document_type,receiver_name)
  values(v_org,v_ss,'HS','Receptor prueba') returning id into v_hs;
  insert into public.inventory_document_lines(organization_id,document_id,request_line_id,line_no,product_id,from_location_id,to_location_id,quantity)
  values(v_org,v_hs,v_ss_line,1,v_product,v_available_location,v_customer_location,5);
  insert into public.document_files(organization_id,document_id,storage_path,file_kind,content_type,created_by)
  values(v_org,v_hs,v_org||'/documents/'||v_hs||'/firma-prueba.png','signature','image/png',v_user);
  perform public.confirm_inventory_document(v_hs);
  perform public.confirm_inventory_document(v_hs);
  select count(*) into v_value from public.inventory_movements where document_id=v_hs and reversal_of_id is null;
  if v_value<>1 then raise exception 'La confirmación idempotente duplicó movimientos'; end if;

  insert into public.operation_requests(organization_id,contract_id,request_type,requested_by)
  values(v_org,v_contract,'SE',v_user) returning id into v_se;
  insert into public.operation_request_lines(organization_id,request_id,contract_line_id,line_no,product_id,quantity)
  values(v_org,v_se,v_contract_line,1,v_product,2) returning id into v_se_line;
  perform public.submit_request(v_se);
  perform public.authorize_request(v_se);
  insert into public.inventory_documents(organization_id,request_id,document_type)
  values(v_org,v_se,'HE') returning id into v_he;
  insert into public.inventory_document_lines(organization_id,document_id,request_line_id,line_no,product_id,from_location_id,to_location_id,quantity)
  select v_org,v_he,v_se_line,1,v_product,v_customer_location,id,2 from public.inventory_locations
  where organization_id=v_org and location_type='inspection' limit 1;
  perform public.confirm_inventory_document(v_he);
  select quantity into v_value from public.inventory_balances where product_id=v_product and location_id=v_customer_location;
  if v_value<>3 then raise exception 'Saldo tras HE incorrecto: %',v_value; end if;

  perform public.reverse_inventory_document(v_he,'Reversión controlada de prueba');
  select quantity into v_value from public.inventory_balances where product_id=v_product and location_id=v_customer_location;
  if v_value<>5 then raise exception 'La reversión de HE no restituyó custodia: %',v_value; end if;
  perform public.reverse_inventory_document(v_hs,'Reversión controlada de prueba');
  select coalesce(quantity,0) into v_value from public.inventory_balances where product_id=v_product and location_id=v_customer_location;
  if v_value<>0 then raise exception 'La reversión de HS no restituyó almacén: %',v_value; end if;
  select consumed_quantity into v_value from public.stock_reservations where request_line_id=v_ss_line;
  if v_value<>0 then raise exception 'La reversión no reconstruyó la reserva: %',v_value; end if;
  select status::text into v_status from public.contracts where id=v_contract;
  if v_status<>'authorized' then raise exception 'Estado contractual tras reversión incorrecto: %',v_status; end if;
end;
$$;

select pass('contract, reservation, inventory document, reversal and return flow works');
select * from finish();
rollback;
