-- Terms follow the pricing by default (owner decision 11 Nov). Moves the Terms
-- block (and the page break before it) to just after the pricing section in
-- every template where Terms is the last thing before the signatures, and in
-- the starter seed for new workspaces. Block ids and content are unchanged.
begin;
create or replace function public.yeswell_terms_after_pricing(c jsonb)
returns jsonb language plpgsql immutable as $fn$
declare
  t int; p int; s int; at int; moved jsonb; rest jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'array' then return c; end if;
  select min(o - 1) into t from jsonb_array_elements(c) with ordinality e(v, o)
    where v->>'type' = 'contract';
  select min(o - 1) into p from jsonb_array_elements(c) with ordinality e(v, o)
    where v->>'type' = 'pricing_table';
  if t is null or p is null or t < p then return c; end if;
  -- Only when Terms is the last thing before the signatures.
  if not exists (select 1 from jsonb_array_elements(c) with ordinality e(v, o)
      where o - 1 > t and v->>'type' = 'signature_block')
    or exists (select 1 from jsonb_array_elements(c) with ordinality e(v, o)
      where o - 1 > t and coalesce(v->>'type', '') not in ('page_break', 'heading', 'signature_block'))
  then return c; end if;
  s := case when t > 0 and c->(t - 1)->>'type' = 'page_break' then t - 1 else t end;
  select coalesce(jsonb_agg(v order by o), '[]'::jsonb) into moved
    from jsonb_array_elements(c) with ordinality e(v, o) where o - 1 between s and t;
  select coalesce(jsonb_agg(v order by o), '[]'::jsonb) into rest
    from jsonb_array_elements(c) with ordinality e(v, o) where o - 1 < s or o - 1 > t;
  at := p + 1;
  while at < jsonb_array_length(rest)
    and coalesce(rest->at->>'type', '') not in ('heading', 'page_break') loop
    at := at + 1;
  end loop;
  return coalesce((select jsonb_agg(v order by o) from jsonb_array_elements(rest)
      with ordinality e(v, o) where o - 1 < at), '[]'::jsonb)
    || moved
    || coalesce((select jsonb_agg(v order by o) from jsonb_array_elements(rest)
      with ordinality e(v, o) where o - 1 >= at), '[]'::jsonb);
end
$fn$;

do $migration$
declare
  definition text;
  seed jsonb;
  revised jsonb;
  affected integer;
begin
  update public.templates
    set data = jsonb_set(data, '{content}', public.yeswell_terms_after_pricing(data->'content'))
    where public.yeswell_terms_after_pricing(data->'content') is distinct from data->'content';
  get diagnostics affected = row_count;
  raise notice 'Templates with Terms moved after pricing: %', affected;

  -- Keep the insert-only seed function, template order and grants; revise its payload.
  select pg_catalog.pg_get_functiondef('public.seed_new_workspace_templates()'::regprocedure)
    into definition;
  seed := split_part(definition, '$starter$', 2)::jsonb;
  select jsonb_agg(
    case when item.value ? 'content'
         then jsonb_set(item.value, '{content}', public.yeswell_terms_after_pricing(item.value->'content'))
         else item.value end
    order by item.position
  ) into revised
  from jsonb_array_elements(seed) with ordinality as item(value, position);
  if revised is distinct from seed then
    execute split_part(definition, '$starter$', 1) || '$starter$'
      || revised::text || '$starter$' || split_part(definition, '$starter$', 3);
  end if;
end
$migration$;

drop function public.yeswell_terms_after_pricing(jsonb);
commit;
