-- Activa el contexto del flujo antes de insertar movimientos protegidos.

create or replace function public.confirm_inventory_count(p_inventory_count_id uuid)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;v_line record;v_current numeric;v_delta numeric;
begin
  perform set_config('andavalle.workflow_action','confirm_inventory_count',true);
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null then raise exception 'Corte físico no encontrado'; end if;
  if v_count.status='confirmed' then return v_count; end if;
  if v_count.status<>'draft' then raise exception 'Corte físico no confirmable'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede confirmar el corte' using errcode='42501'; end if;
  if not exists(select 1 from public.inventory_count_lines where inventory_count_id=v_count.id) then raise exception 'El corte no tiene partidas'; end if;
  for v_line in select * from public.inventory_count_lines where inventory_count_id=v_count.id order by product_id,location_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_count.organization_id::text||v_line.product_id::text||v_line.location_id::text,0));
    select quantity into v_current from public.inventory_balances where organization_id=v_count.organization_id and product_id=v_line.product_id and location_id=v_line.location_id;
    v_current:=coalesce(v_current,0);
    if v_current<>v_line.system_quantity then raise exception 'El saldo cambió después de capturar el corte; actualiza el borrador antes de confirmar'; end if;
    v_delta:=v_line.counted_quantity-v_current;
    if v_delta>0 then
      insert into public.inventory_movements(organization_id,inventory_count_id,product_id,to_location_id,quantity,movement_kind,created_by)
      values(v_count.organization_id,v_count.id,v_line.product_id,v_line.location_id,v_delta,'physical_count',(select auth.uid()));
    elsif v_delta<0 then
      insert into public.inventory_movements(organization_id,inventory_count_id,product_id,from_location_id,quantity,movement_kind,created_by)
      values(v_count.organization_id,v_count.id,v_line.product_id,v_line.location_id,abs(v_delta),'physical_count',(select auth.uid()));
    end if;
  end loop;
  update public.inventory_counts set status='confirmed',confirmed_by=(select auth.uid()),confirmed_at=now() where id=v_count.id returning * into v_count;
  return v_count;
end;
$$;

create or replace function public.reverse_inventory_count(p_inventory_count_id uuid,p_reason text)
returns public.inventory_counts
language plpgsql
security invoker
set search_path=''
as $$
declare v_count public.inventory_counts;v_movement public.inventory_movements;v_balance numeric;
begin
  perform set_config('andavalle.workflow_action','reverse_inventory_count',true);
  select * into v_count from public.inventory_counts where id=p_inventory_count_id for update;
  if v_count.id is null or v_count.status<>'confirmed' then raise exception 'Corte físico no reversible'; end if;
  if not private.has_any_role(v_count.organization_id,array['admin']::public.member_role[]) then raise exception 'Sólo administración puede revertir el corte' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  for v_movement in select * from public.inventory_movements where inventory_count_id=v_count.id and reversal_of_id is null order by product_id,id loop
    perform pg_advisory_xact_lock(hashtextextended(v_count.organization_id::text||v_movement.product_id::text||coalesce(v_movement.to_location_id,v_movement.from_location_id)::text,0));
    if v_movement.to_location_id is not null then
      select quantity into v_balance from public.inventory_balances where organization_id=v_count.organization_id and product_id=v_movement.product_id and location_id=v_movement.to_location_id;
      if coalesce(v_balance,0)<v_movement.quantity then raise exception 'No se puede revertir: el inventario agregado ya fue consumido'; end if;
    end if;
    insert into public.inventory_movements(organization_id,inventory_count_id,product_id,from_location_id,to_location_id,quantity,movement_kind,reversal_of_id,created_by)
    values(v_movement.organization_id,v_count.id,v_movement.product_id,v_movement.to_location_id,v_movement.from_location_id,v_movement.quantity,'physical_count_reversal',v_movement.id,(select auth.uid()));
  end loop;
  update public.inventory_counts set status='reversed',reversed_by=(select auth.uid()),reversed_at=now(),reversal_reason=trim(p_reason) where id=v_count.id returning * into v_count;
  return v_count;
end;
$$;

revoke execute on function public.confirm_inventory_count(uuid),public.reverse_inventory_count(uuid,text) from public,anon;
grant execute on function public.confirm_inventory_count(uuid),public.reverse_inventory_count(uuid,text) to authenticated;
