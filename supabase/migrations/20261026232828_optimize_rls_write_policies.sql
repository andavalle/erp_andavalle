-- Las políticas FOR ALL también participan en SELECT. Separarlas evita evaluar
-- dos políticas permisivas de lectura sin modificar los permisos de escritura.
do $$
declare
  v_policy record;
  v_using text;
  v_check text;
begin
  for v_policy in
    select * from (values
      ('branches','branches_admin_write'),
      ('contract_lines','contract_lines_commercial_write'),
      ('contracts','contracts_commercial_write'),
      ('customer_sites','sites_commercial_write'),
      ('customers','customers_commercial_write'),
      ('document_files','files_warehouse_write'),
      ('inventory_count_lines','inventory_count_lines_write'),
      ('inventory_counts','inventory_counts_write'),
      ('inventory_document_lines','document_lines_warehouse_write'),
      ('inventory_documents','documents_warehouse_write'),
      ('inventory_locations','locations_admin_warehouse_write'),
      ('logistics_assignments','logistics_write'),
      ('operation_request_lines','request_lines_operational_write'),
      ('operation_requests','requests_operational_write'),
      ('organization_member_roles','member_roles_admin_write'),
      ('organization_members','memberships_admin_write'),
      ('product_prices','product_prices_admin_write'),
      ('products','products_catalog_write'),
      ('quotation_lines','quotation_lines_write'),
      ('rental_operations','rental_operations_write'),
      ('rental_rate_tiers','rental_rate_tiers_admin_write'),
      ('stock_reservations','reservations_warehouse_write'),
      ('warehouses','warehouses_admin_write')
    ) as policies(table_name,policy_name)
  loop
    select pg_get_expr(policy.polqual,policy.polrelid),
           pg_get_expr(policy.polwithcheck,policy.polrelid)
      into v_using,v_check
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid=policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname=v_policy.table_name
      and policy.polname=v_policy.policy_name;

    if v_using is null or v_check is null then
      raise exception 'No se encontró la política %.%',v_policy.table_name,v_policy.policy_name;
    end if;

    execute format('drop policy %I on public.%I',v_policy.policy_name,v_policy.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_policy.policy_name||'_insert',v_policy.table_name,v_check
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_policy.policy_name||'_update',v_policy.table_name,v_using,v_check
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_policy.policy_name||'_delete',v_policy.table_name,v_using
    );
  end loop;
end
$$;
