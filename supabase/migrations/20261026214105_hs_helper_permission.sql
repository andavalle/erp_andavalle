-- El helper permanece en un esquema no expuesto; el permiso permite su uso
-- exclusivamente desde las funciones SECURITY INVOKER validadas.
grant execute on function private.replace_hs_lines(uuid,jsonb) to authenticated;
