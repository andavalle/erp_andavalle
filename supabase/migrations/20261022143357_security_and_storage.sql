grant usage on schema public to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.user_in_organization(uuid) to authenticated;
grant execute on function private.has_any_role(uuid,public.member_role[]) to authenticated;
revoke execute on function private.next_folio(uuid,text,date) from public, anon, authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_member_roles enable row level security;

create policy organizations_read on public.organizations for select to authenticated
using ((select private.user_in_organization(id)));
create policy profiles_read on public.profiles for select to authenticated
using (id=(select auth.uid()) or exists(select 1 from public.organization_members mine join public.organization_members theirs on theirs.organization_id=mine.organization_id where mine.profile_id=(select auth.uid()) and mine.active and theirs.profile_id=profiles.id and theirs.active));
create policy profiles_update_self on public.profiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy memberships_read on public.organization_members for select to authenticated
using ((select private.user_in_organization(organization_id)));
create policy memberships_admin_write on public.organization_members for all to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy member_roles_read on public.organization_member_roles for select to authenticated
using ((select private.user_in_organization(organization_id)));
create policy member_roles_admin_write on public.organization_member_roles for all to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[])))
with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));

do $$
declare t text;
begin
  foreach t in array array['branches','warehouses','customers','customer_sites','crm_leads','customer_activities','products','inventory_locations','contract_chains','contracts','contract_lines','operation_requests','operation_request_lines','logistics_assignments','inventory_documents','inventory_document_lines','stock_reservations','inventory_movements','document_files','document_sequences','audit_events']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.user_in_organization(organization_id)))',t||'_org_read',t);
  end loop;
end $$;

create policy branches_admin_write on public.branches for all to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy warehouses_admin_write on public.warehouses for all to authenticated
using ((select private.has_any_role(organization_id,array['admin']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin']::public.member_role[])));
create policy locations_admin_warehouse_write on public.inventory_locations for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));

create policy customers_commercial_write on public.customers for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy sites_commercial_write on public.customer_sites for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy leads_commercial_write on public.crm_leads for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy activities_commercial_write on public.customer_activities for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy products_catalog_write on public.products for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial','warehouse']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial','warehouse']::public.member_role[])));

create policy chains_commercial_insert on public.contract_chains for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy contracts_commercial_write on public.contracts for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));
create policy contract_lines_commercial_write on public.contract_lines for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial']::public.member_role[])));

create policy requests_operational_write on public.operation_requests for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[])));
create policy request_lines_operational_write on public.operation_request_lines for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','commercial','warehouse','logistics']::public.member_role[])));
create policy logistics_write on public.logistics_assignments for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','logistics']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','logistics']::public.member_role[])));
create policy documents_warehouse_write on public.inventory_documents for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));
create policy document_lines_warehouse_write on public.inventory_document_lines for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));
create policy reservations_warehouse_write on public.stock_reservations for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','warehouse','commercial']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','warehouse','commercial']::public.member_role[])));
create policy movements_warehouse_insert on public.inventory_movements for insert to authenticated
with check ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));
create policy files_warehouse_write on public.document_files for all to authenticated
using ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[]))) with check ((select private.has_any_role(organization_id,array['admin','warehouse']::public.member_role[])));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.organizations,public.profiles,public.organization_members,public.organization_member_roles,public.branches,public.warehouses,public.customers,public.customer_sites,public.crm_leads,public.customer_activities,public.products,public.inventory_locations,public.contract_chains,public.contracts,public.contract_lines,public.operation_requests,public.operation_request_lines,public.logistics_assignments,public.inventory_documents,public.inventory_document_lines,public.stock_reservations,public.inventory_movements,public.document_files,public.audit_events,public.inventory_balances,public.inventory_availability to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert,update,delete on public.organization_members,public.organization_member_roles,public.branches,public.warehouses,public.customers,public.customer_sites,public.crm_leads,public.customer_activities,public.products,public.inventory_locations,public.contract_chains,public.contracts,public.contract_lines,public.operation_requests,public.operation_request_lines,public.logistics_assignments,public.inventory_documents,public.inventory_document_lines,public.stock_reservations,public.document_files to authenticated;
grant insert on public.inventory_movements to authenticated;
grant usage,select on all sequences in schema public to authenticated;

revoke execute on function public.authorize_contract(uuid) from public,anon;
revoke execute on function public.submit_contract(uuid) from public,anon;
revoke execute on function public.cancel_contract(uuid,text) from public,anon;
revoke execute on function public.authorize_request(uuid) from public,anon;
revoke execute on function public.submit_request(uuid) from public,anon;
revoke execute on function public.cancel_request(uuid) from public,anon;
revoke execute on function public.confirm_inventory_document(uuid) from public,anon;
revoke execute on function public.reverse_inventory_document(uuid,text) from public,anon;
revoke execute on function public.cancel_inventory_document(uuid,text) from public,anon;
revoke execute on function public.renew_contract(uuid,date,date) from public,anon;
revoke execute on function public.close_contract(uuid,boolean,text) from public,anon;
grant execute on function public.submit_contract(uuid),public.authorize_contract(uuid),public.cancel_contract(uuid,text),public.submit_request(uuid),public.authorize_request(uuid),public.cancel_request(uuid),public.confirm_inventory_document(uuid),public.reverse_inventory_document(uuid,text),public.cancel_inventory_document(uuid,text),public.renew_contract(uuid,date,date),public.close_contract(uuid,boolean,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('erp-documents','erp-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy erp_documents_read on storage.objects for select to authenticated
using (bucket_id='erp-documents' and (select private.user_in_organization(((storage.foldername(name))[1])::uuid)));
create policy erp_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='erp-documents' and (select private.has_any_role(((storage.foldername(name))[1])::uuid,array['admin','warehouse']::public.member_role[])));
create policy erp_documents_delete on storage.objects for delete to authenticated
using (bucket_id='erp-documents' and (select private.has_any_role(((storage.foldername(name))[1])::uuid,array['admin']::public.member_role[])));
