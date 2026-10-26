create function private.create_customer_custody_location()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.inventory_locations(organization_id,customer_site_id,code,name,location_type,active)
  values(new.organization_id,new.id,'CUS-'||replace(new.id::text,'-',''),'Custodia · '||new.name,'customer',true)
  on conflict(organization_id,code) do nothing;
  return new;
end;
$$;

create trigger customer_sites_create_custody_location
after insert on public.customer_sites
for each row execute function private.create_customer_custody_location();

insert into public.inventory_locations(organization_id,customer_site_id,code,name,location_type,active)
select s.organization_id,s.id,'CUS-'||replace(s.id::text,'-',''),'Custodia · '||s.name,'customer',true
from public.customer_sites s
where not exists(
  select 1 from public.inventory_locations l
  where l.organization_id=s.organization_id and l.customer_site_id=s.id and l.location_type='customer'
);
