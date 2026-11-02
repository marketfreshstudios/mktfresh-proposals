-- Draft/template authoring only. Never update sent proposal state or version data.
update public.proposals p
set revision = p.revision + 1,
 state = jsonb_set(p.state, '{revision}', to_jsonb(p.revision + 1)) || jsonb_build_object('content', (
 select coalesce(jsonb_agg(case when b->>'type'='heading' and not(b ? 'level')
   then b || '{"level":1}'::jsonb else b end order by n), '[]'::jsonb)
 from jsonb_array_elements(coalesce(p.state->'content','[]'::jsonb)) with ordinality x(b,n)
))
where p.state->>'status'='draft' and p.state->>'source'='native'
 and exists(select 1 from jsonb_array_elements(p.state->'content') b where b->>'type'='heading' and not(b ? 'level'));
update public.templates t
set data = jsonb_set(t.data, '{content}', (
 select coalesce(jsonb_agg(case when b->>'type'='heading' and not(b ? 'level')
   then b || '{"level":1}'::jsonb else b end order by n), '[]'::jsonb)
 from jsonb_array_elements(coalesce(t.data->'content','[]'::jsonb)) with ordinality x(b,n)
))
where exists(select 1 from jsonb_array_elements(coalesce(t.data->'content','[]'::jsonb)) b where b->>'type'='heading' and not(b ? 'level'));
-- Styles remain optional JSON fields: existing versions retain their old hash input.
-- Existing RLS policies, immutable evidence guards and grants are unchanged.
