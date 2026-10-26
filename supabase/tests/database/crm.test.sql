begin;
select plan(1);

do $$
declare
  v_org constant uuid := '10000000-0000-0000-0000-000000000001';
  v_user uuid := gen_random_uuid();
  v_lead uuid := gen_random_uuid();
  v_source uuid;
  v_loss uuid;
  v_result jsonb;
  v_customer uuid;
  v_site uuid;
  v_code text;
begin
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  insert into auth.users(id,email,raw_user_meta_data)
  values(v_user,'comercial-crm@andavalle.test','{"display_name":"Comercial CRM"}'::jsonb);
  insert into public.organization_members(organization_id,profile_id) values(v_org,v_user);
  insert into public.organization_member_roles(organization_id,profile_id,role_code) values(v_org,v_user,'commercial');
  select id into v_source from public.crm_sources where organization_id=v_org and code='manual';
  select id into v_loss from public.crm_loss_reasons where organization_id=v_org and code='price';

  insert into public.crm_leads(id,organization_id,name,company,phone,need_summary,source_id,created_by)
  values(v_lead,v_org,'Contacto prueba','Empresa CRM','7225559999','Necesidad comercial suficiente para validar el flujo.',v_source,v_user);

  set local role authenticated;
  perform public.claim_crm_lead(v_lead);
  insert into public.customer_activities(organization_id,lead_id,activity_type,summary,due_at,assigned_to,created_by)
  values(v_org,v_lead,'call','Llamada de seguimiento',now()+interval '1 day',v_user,v_user);
  perform public.transition_crm_lead(v_lead,'contacted');
  perform public.transition_crm_lead(v_lead,'qualified');

  v_result:=public.create_crm_customer(v_lead,'legal_entity','Cliente CRM S.A. de C.V.','Cliente CRM','CRM010101AA1','Contacto prueba','Compras','7225559999','crm@test.local','Obra CRM','Dirección de obra número 100');
  v_customer:=(v_result->>'customer_id')::uuid;
  v_site:=(v_result->>'site_id')::uuid;
  select customer_code into v_code from public.customers where id=v_customer;
  if v_code !~ '^CLI-[0-9]{6}$' then raise exception 'Folio de cliente inválido: %',v_code; end if;
  select site_code into v_code from public.customer_sites where id=v_site;
  if v_code !~ '^OBR-[0-9]{6}$' then raise exception 'Folio de obra inválido: %',v_code; end if;
  if not exists(select 1 from public.crm_assignment_history where lead_id=v_lead and new_assignee=v_user) then
    raise exception 'No se registró el historial de asignación';
  end if;
  if not exists(select 1 from public.customer_contacts where customer_id=v_customer and site_id=v_site and is_primary) then
    raise exception 'No se creó el contacto principal';
  end if;
  reset role;

  begin
    insert into public.customers(organization_id,customer_code,legal_name,tax_id)
    values(v_org,'CLI-DUPLICADO','Duplicado CRM','CRM010101AA1');
    raise exception 'Se permitió duplicar un RFC activo';
  exception when unique_violation then
    null;
  end;

  -- Un segundo caso verifica cierre y reapertura sin alterar el historial original.
  insert into public.crm_leads(organization_id,name,phone,need_summary,source_id,assigned_to,created_by)
  values(v_org,'Oportunidad perdida','7225558888','Caso separado para validar pérdida y reapertura.',v_source,v_user,v_user)
  returning id into v_lead;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  set local role authenticated;
  perform public.transition_crm_lead(v_lead,'lost',v_loss,'Cliente fuera de presupuesto');
  if (public.clone_lost_crm_lead(v_lead)).previous_lead_id<>v_lead then
    raise exception 'La oportunidad retomada no conserva el vínculo anterior';
  end if;
  reset role;

  set local role service_role;
  v_lead:=public.create_website_crm_lead(
    v_org,'Prospecto web','Empresa web','7225557777','web@test.local',
    'Solicitud creada desde el formulario público para validar atomicidad.','2026-10-26'
  );
  if not exists(
    select 1 from public.customer_activities
    where lead_id=v_lead and activity_type='task' and due_at between now()+interval '23 hours' and now()+interval '25 hours'
  ) then raise exception 'El prospecto web no creó su actividad de 24 horas'; end if;
  reset role;
end;
$$;

select pass('CRM opportunity, assignment, conversion, folios and reopening flow works');
select * from finish();
rollback;
