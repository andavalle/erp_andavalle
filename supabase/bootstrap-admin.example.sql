-- Ejecuta este archivo una sola vez, después de crear/invitar el primer usuario.
-- Sustituye FIRST_USER_UUID por el UUID visible en Authentication > Users.
insert into public.organization_members(organization_id,profile_id)
values('10000000-0000-0000-0000-000000000001','FIRST_USER_UUID');

insert into public.organization_member_roles(organization_id,profile_id,role_code)
values('10000000-0000-0000-0000-000000000001','FIRST_USER_UUID','admin');
