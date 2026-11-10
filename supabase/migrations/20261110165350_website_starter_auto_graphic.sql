-- Apply before deploying the matching starter seed. #138 must already be applied.
begin;
do $migration$
declare
  website_key constant text := 'website-design-build';
  shipped_cover_hash constant text := '39ae0b3d38b346491b03147ca33d4396';
  definition text;
  seed jsonb;
  revised jsonb;
  affected integer;
begin
  update public.templates
    set data = jsonb_set(data, '{cover,background,graphic}', '"auto"'::jsonb, false)
    where workspace_id = '00000000-0000-4000-8000-000000000001'::uuid
      and data->>'starter_key' = website_key
      and md5((data->'cover')::text) = shipped_cover_hash;
  get diagnostics affected = row_count;
  raise notice 'Website starter covers updated: %', affected;

  -- Keep the insert-only function, template order and grants from #138.
  select pg_catalog.pg_get_functiondef('public.seed_new_workspace_templates()'::regprocedure)
    into definition;
  seed := split_part(definition, '$starter$', 2)::jsonb;
  select jsonb_agg(
    case when item.value->>'starter_key' = website_key
           and md5((item.value->'cover')::text) = shipped_cover_hash
         then jsonb_set(item.value, '{cover,background,graphic}', '"auto"'::jsonb, false)
         else item.value end
    order by item.position
  ) into revised
  from jsonb_array_elements(seed) with ordinality as item(value, position);
  if revised is distinct from seed then
    execute split_part(definition, '$starter$', 1) || '$starter$'
      || revised::text || '$starter$' || split_part(definition, '$starter$', 3);
  end if;
end $migration$;
commit;
