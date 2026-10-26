create function private.require_hs_signature_on_confirm()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.document_type='HS' and old.status='draft' and new.status='confirmed'
     and not exists(
       select 1 from public.document_files
       where document_id=new.id and file_kind='signature'
     ) then
    raise exception 'Adjunta la firma del receptor antes de confirmar la Hoja de Salida';
  end if;
  return new;
end;
$$;

create trigger inventory_documents_require_hs_signature
before update on public.inventory_documents
for each row execute function private.require_hs_signature_on_confirm();
