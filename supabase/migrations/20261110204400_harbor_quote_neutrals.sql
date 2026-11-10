-- Apply after deploying the document Styles controls. Missing quote colors
-- mean the original palette in stored versions. Never update any version.
create function pg_temp.matches_default_quote_style(
  settings jsonb, template_styles jsonb, proposal_styles jsonb
) returns boolean language sql immutable as $$
  with baseline as (
    select
      '{"size":25,"weight":600,"colour":"ink","letter_case":"normal","letter_spacing":-0.015,"space_above":27.5,"space_below":8.75}'::jsonb
        || jsonb_build_object('font', coalesce(settings #> '{proposal_fonts,heading}', '"serif"')) as heading,
      coalesce(settings #> '{proposal_fonts,body}', '"serif"') as body_font,
      coalesce(settings->'proposal_styles','{}') as workspace,
      coalesce(template_styles,'{}') as template,
      coalesce(proposal_styles,'{}') as proposal
  ), levels as (
    select 'title' as key, heading || '{"size":40,"letter_spacing":-0.025,"space_above":12,"space_below":20}' as style from baseline
    union all select 'heading1', heading from baseline
    union all select 'heading2', heading || '{"size":17,"letter_spacing":0,"space_above":18.7,"space_below":5.95}' from baseline
    union all select 'heading3', heading || '{"size":15,"letter_spacing":0,"space_above":16.5,"space_below":5.25}' from baseline
    union all select 'body', heading || '{"size":16,"weight":400,"letter_spacing":0,"space_above":0,"space_below":9.6}'
      || jsonb_build_object('font', body_font) from baseline
  )
  select not (workspace ? 'quote_neutrals' or template ? 'quote_neutrals' or proposal ? 'quote_neutrals')
    and coalesce(proposal->>'density', template->>'density', workspace->>'density','standard') = 'standard'
    and coalesce(proposal->>'quote_layout', template->>'quote_layout', workspace->>'quote_layout','cards') = 'cards'
    and '{"top":0.75,"right":0.75,"bottom":0.75,"left":0.75}'::jsonb =
      '{"top":0.75,"right":0.75,"bottom":0.75,"left":0.75}'::jsonb
      || coalesce(workspace->'margins','{}') || coalesce(template->'margins','{}') || coalesce(proposal->'margins','{}')
    and not exists (
      select 1 from levels where style is distinct from
        (style || coalesce(workspace->key,'{}') || coalesce(template->key,'{}') || coalesce(proposal->key,'{}'))
    )
  from baseline;
$$;

-- Check the existing proposal snapshot of template overrides and the workspace
-- defaults that are used in the draft editor. Templates can change independently.
update public.proposals p
set state = jsonb_set(p.state, '{style_overrides}',
  coalesce(p.state->'style_overrides', '{}') || '{"quote_neutrals":{}}')
where p.status = 'draft'
  and p.source = 'native'
  and p.token is null
  and coalesce(p.state->>'token', p.state->>'sent_at', p.state->>'client_signed_at',
    p.state->>'completed_at', p.state->>'published_state') is null
  and coalesce(jsonb_array_length(p.state->'versions'), 0) = 0
  and coalesce(jsonb_array_length(p.state->'signers'), 0) = 0
  and not exists (select 1 from public.proposal_versions v where v.proposal_id = p.id)
  and pg_temp.matches_default_quote_style(
    coalesce(
      (select w.data from public.workspace_settings w
        where w.workspace_id = p.workspace_id order by w.id limit 1),
      p.state->'workspace_settings'
    ),
    p.state->'template_style_overrides',
    p.state->'style_overrides'
  );

update public.templates t
set data = jsonb_set(t.data, '{style_overrides}',
  coalesce(t.data->'style_overrides', '{}') || '{"quote_neutrals":{}}')
where pg_temp.matches_default_quote_style(
  (select w.data from public.workspace_settings w
    where w.workspace_id = t.workspace_id order by w.id limit 1),
  t.data->'style_overrides',
  null
);

drop function pg_temp.matches_default_quote_style(jsonb,jsonb,jsonb);
