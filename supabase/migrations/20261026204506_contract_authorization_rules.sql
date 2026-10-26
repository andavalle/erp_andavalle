drop function if exists public.authorize_contract(uuid);

create function public.authorize_contract(p_contract_id uuid,p_justification text default null)
returns public.contracts
language plpgsql
security invoker
set search_path=''
as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','authorize_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[]) then
    raise exception 'Sólo administración puede autorizar contratos' using errcode='42501';
  end if;
  if v_contract.status<>'pending_authorization' then raise exception 'El contrato debe estar pendiente de autorización'; end if;
  if not exists(select 1 from public.contract_lines where contract_id=p_contract_id) then raise exception 'El contrato no tiene partidas'; end if;
  if v_contract.created_by=(select auth.uid()) and length(trim(coalesce(p_justification,'')))<10 then
    raise exception 'La autorización propia requiere una justificación de al menos 10 caracteres';
  end if;
  update public.contracts
  set status='authorized',authorized_by=(select auth.uid()),authorized_at=now(),
      notes=case when created_by=(select auth.uid()) then concat_ws(E'\n',notes,'Autorización propia: '||trim(p_justification)) else notes end
  where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create or replace function public.submit_contract(p_contract_id uuid)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','submit_contract',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_contract.organization_id,array['commercial']::public.member_role[]) and v_contract.created_by=(select auth.uid())) then
    raise exception 'Sin permiso para enviar este contrato' using errcode='42501';
  end if;
  if v_contract.status<>'draft' then raise exception 'Sólo un contrato en borrador puede enviarse'; end if;
  if not exists(select 1 from public.contract_lines where contract_id=p_contract_id) then raise exception 'El contrato no tiene partidas'; end if;
  update public.contracts set status='pending_authorization' where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create function public.return_contract_to_draft(p_contract_id uuid,p_reason text)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','return_contract_to_draft',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[]) then
    raise exception 'Sólo administración puede devolver contratos a borrador' using errcode='42501';
  end if;
  if v_contract.status<>'pending_authorization' then raise exception 'Sólo un contrato pendiente puede regresar a borrador'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Indica un motivo de al menos 10 caracteres'; end if;
  update public.contracts set status='draft',notes=concat_ws(E'\n',notes,'Devuelto a borrador: '||trim(p_reason))
  where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create function public.update_contract_draft(
  p_contract_id uuid,p_starts_on date,p_ends_on date,p_notes text default null,p_rental_operation_id uuid default null
)
returns public.contracts
language plpgsql security invoker set search_path='' as $$
declare v_contract public.contracts;
begin
  perform set_config('andavalle.workflow_action','update_contract_draft',true);
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if v_contract.id is null then raise exception 'Contrato no encontrado'; end if;
  if not private.has_any_role(v_contract.organization_id,array['admin']::public.member_role[])
     and not (private.has_any_role(v_contract.organization_id,array['commercial']::public.member_role[]) and v_contract.created_by=(select auth.uid())) then
    raise exception 'Sin permiso para editar este contrato' using errcode='42501';
  end if;
  if v_contract.status<>'draft' then raise exception 'Sólo puede editarse un contrato en borrador'; end if;
  if p_ends_on is not null and p_ends_on<p_starts_on then raise exception 'La fecha final no puede ser anterior'; end if;
  if v_contract.contract_type='rental' and not exists(
    select 1 from public.rental_operations o where o.id=p_rental_operation_id and o.organization_id=v_contract.organization_id
      and o.customer_id=v_contract.customer_id and o.site_id=v_contract.site_id and o.status in ('planned','active','pending_return')
  ) then raise exception 'La OR no corresponde al cliente y obra del contrato'; end if;
  update public.contracts set starts_on=p_starts_on,ends_on=p_ends_on,notes=nullif(trim(coalesce(p_notes,'')),''),
    rental_operation_id=case when contract_type='rental' then p_rental_operation_id end
  where id=p_contract_id returning * into v_contract;
  return v_contract;
end;
$$;

create function private.protect_contract_content()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status<>'draft' and coalesce(current_setting('andavalle.workflow_action',true),'')='' and (
    old.contract_chain_id is distinct from new.contract_chain_id or old.previous_contract_id is distinct from new.previous_contract_id
    or old.customer_id is distinct from new.customer_id or old.site_id is distinct from new.site_id
    or old.contract_type is distinct from new.contract_type or old.starts_on is distinct from new.starts_on
    or old.ends_on is distinct from new.ends_on or old.currency is distinct from new.currency
    or old.notes is distinct from new.notes or old.rental_operation_id is distinct from new.rental_operation_id
  ) then raise exception 'Un contrato enviado o autorizado no puede editarse directamente' using errcode='42501'; end if;
  return new;
end;
$$;

create trigger contracts_protect_content before update on public.contracts
for each row execute function private.protect_contract_content();

create function private.contract_lines_draft_only()
returns trigger language plpgsql set search_path='' as $$
declare v_status public.contract_status;
begin
  select status into v_status from public.contracts where id=coalesce(new.contract_id,old.contract_id);
  if v_status<>'draft' then raise exception 'Las partidas sólo pueden editarse mientras el contrato está en borrador' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger contract_lines_draft_only before insert or update or delete on public.contract_lines
for each row execute function private.contract_lines_draft_only();

revoke execute on function public.authorize_contract(uuid,text),public.return_contract_to_draft(uuid,text),public.update_contract_draft(uuid,date,date,text,uuid) from public,anon;
grant execute on function public.authorize_contract(uuid,text),public.return_contract_to_draft(uuid,text),public.update_contract_draft(uuid,date,date,text,uuid) to authenticated;
