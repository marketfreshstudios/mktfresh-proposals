-- Apply before deploy. No new schema, grants, or changes to published versions.
begin;
do $migration$
declare
  slot_path constant text[] := '{header_footer,shared,header,slots,0}';
  height_path constant text[] := '{header_footer,headerSpacing,heightIn}';
  gap_path constant text[] := '{header_footer,headerSpacing,spaceToContent}';
  legacy constant jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"image","attrs":{"src":"workspace-logo","alt":"Workspace logo","height":18}},{"type":"text","text":"{{workspace.name}}"}]}]}'::jsonb;
  replacement constant jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"image","attrs":{"src":"workspace-brand","alt":"Workspace logo","height":18}},{"type":"text","text":""}]}]}'::jsonb;
  affected integer;
begin
  update public.templates t
    set data = jsonb_set(t.data - 'pagination', slot_path, replacement, false)
    where t.data #> slot_path = legacy;
  get diagnostics affected = row_count;
  raise notice 'Template header slots repaired: %', affected;

  update public.templates t
    set data = jsonb_set(jsonb_set(t.data - 'pagination', height_path, '0.25', false), gap_path, '8', false)
    where t.id = 'a0fd95dd-30df-4ee4-8a53-41caf94a1c29'
      and t.workspace_id = '00000000-0000-4000-8000-000000000001'
      and t.data->>'starter_key' = 'website-design-build'
      and t.data #> height_path = '0.4'::jsonb
      and t.data #> gap_path = '31'::jsonb;
  get diagnostics affected = row_count;
  raise notice 'Website starter spacing reset: %', affected;

  update public.proposals p
    set revision = p.revision + 1,
        state = jsonb_set(
          jsonb_set(p.state - 'pagination', slot_path, replacement, false),
          '{revision}', to_jsonb(p.revision + 1), false
        )
    where p.status = 'draft'
      and p.source = 'native'
      and p.state->>'status' = 'draft'
      and p.state->'revision' = to_jsonb(p.revision)
      and p.state->>'sent_at' is null
      and p.state->>'token' is null
      and p.state->>'archived_at' is null
      and p.state->>'client_signed_at' is null
      and p.state->>'completed_at' is null
      and coalesce(p.state->'signers', '[]'::jsonb) = '[]'::jsonb
      and coalesce(p.state->'versions', '[]'::jsonb) = '[]'::jsonb
      and p.state #> slot_path = legacy;
  get diagnostics affected = row_count;
  raise notice 'Unsent draft header slots repaired: %', affected;
end $migration$;
commit;
