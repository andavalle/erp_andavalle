begin;
select plan(1);

insert into auth.users(id,email) values
  ('20000000-0000-0000-0000-000000000001','uno@andavalle.test'),
  ('20000000-0000-0000-0000-000000000002','dos@andavalle.test');
insert into public.organizations(id,name) values('20000000-0000-0000-0000-000000000010','Organización aislada');
insert into public.organization_members(organization_id,profile_id) values
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000002');
insert into public.organization_member_roles(organization_id,profile_id,role_code) values
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','commercial'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','warehouse');
insert into public.customers(organization_id,customer_code,legal_name)
values('20000000-0000-0000-0000-000000000010','OCULTO','Cliente de otra organización');

select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.organizations)<>1 then raise exception 'RLS expuso otra organización'; end if;
  if exists(select 1 from public.customers where customer_code='OCULTO') then raise exception 'RLS expuso un cliente ajeno'; end if;
  if not private.has_any_role('10000000-0000-0000-0000-000000000001',array['commercial']::public.member_role[])
     or not private.has_any_role('10000000-0000-0000-0000-000000000001',array['warehouse']::public.member_role[])
     or private.has_any_role('10000000-0000-0000-0000-000000000001',array['logistics']::public.member_role[]) then
    raise exception 'La unión de roles es incorrecta';
  end if;
end;
$$;
reset role;

update public.organization_members set active=false
where organization_id='10000000-0000-0000-0000-000000000001' and profile_id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$
begin
  if exists(select 1 from public.organizations) then raise exception 'La membresía desactivada conserva acceso'; end if;
end;
$$;
reset role;

select pass('RLS isolates organizations and revokes access for inactive memberships');
select * from finish();
rollback;
