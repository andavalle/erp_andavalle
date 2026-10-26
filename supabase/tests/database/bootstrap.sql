begin;
select plan(3);

select has_schema('auth','Supabase auth schema exists');
select has_schema('storage','Supabase storage schema exists');
select has_function('auth','uid',array[]::text[],'auth.uid exists');

select * from finish();
rollback;
