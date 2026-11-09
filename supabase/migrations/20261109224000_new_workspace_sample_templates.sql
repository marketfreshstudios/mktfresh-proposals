-- Before deploy. Insert-only for new workspaces; never backfills existing tenants.
create function public.seed_new_workspace_samples()
returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  sample record;
  sample_id uuid;
  blocks jsonb;
  sample_cover constant jsonb := $cover${"logo_mode":"brand","workspace":"","eyebrow":"","prepared_for":"Prepared for {{client.company}}","byline":"{{proposal.validity}}","layout":"editorial","logo_height":26,"background":{"type":"plain","graphic":"auto"},"elements":[{"id":"logo","kind":"logo","align":"left"},{"id":"workspace","kind":"workspace","align":"left","content":{"type":"doc","content":[{"type":"paragraph"}]},"hidden":true},{"id":"eyebrow","kind":"eyebrow","align":"left","content":{"type":"doc","content":[{"type":"paragraph"}]}},{"id":"title","kind":"title","align":"left","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"{{proposal.title}}"}]}]}},{"id":"prepared_for","kind":"prepared_for","align":"left","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variable","attrs":{"path":"client.company"}}]}]},"label":"Prepared for","meta":"prepared_for"},{"id":"byline","kind":"extra","align":"left","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variable","attrs":{"path":"proposal.valid_until"}}]}]},"meta":"valid_until","label":"Valid until"},{"id":"prepared-by","kind":"extra","align":"left","label":"Prepared by","meta":"prepared_by","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variable","attrs":{"path":"sender.name"}},{"type":"text","text":", "},{"type":"variable","attrs":{"path":"workspace.name"}}]}]}},{"id":"date","kind":"extra","align":"left","label":"Date","meta":"date","content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"variable","attrs":{"path":"proposal.date"}}]}]}}]}$cover$::jsonb;
begin
  if new.id = '00000000-0000-4000-8000-000000000001' then return new; end if;

  for sample in
    select * from (values
      ('website', 'Website proposal', 'A website that works as hard as you do.',
        array['Overview', 'Goals', 'Scope of work', 'Timeline', 'Investment', 'Next steps', 'Agreement']),
      ('care', 'Care plan', 'Keeping your site healthy.',
        array['Overview', 'What’s included', 'Investment', 'Agreement']),
      ('retainer', 'Monthly retainer', 'Ongoing help, every month.',
        array['Overview', 'Goals', 'Monthly scope', 'Investment', 'Agreement'])
    ) as samples(key, name, description, headings)
  loop
    sample_id := pg_catalog.md5(new.id::text || ':sample:' || sample.key)::uuid;
    select jsonb_agg(block order by position, sequence) into blocks
    from (
      select position, 1 as sequence,
        jsonb_build_object('id', gen_random_uuid(), 'type', 'heading', 'level', 1, 'text', heading) as block
      from unnest(sample.headings) with ordinality as sections(heading, position)
      union all
      select 1, 2, jsonb_build_object('id', gen_random_uuid(), 'type', 'paragraph', 'text', sample.description)
      union all
      select array_position(sample.headings, 'Investment'), 2,
        jsonb_build_object('id', gen_random_uuid(), 'type', 'pricing_table')
      union all
      select cardinality(sample.headings), 2,
        jsonb_build_object('id', gen_random_uuid(), 'type', 'heading', 'level', 2, 'text', 'Signatures')
      union all
      select cardinality(sample.headings), 3,
        jsonb_build_object('id', gen_random_uuid(), 'type', 'signature_block', 'role', 'client')
      union all
      select cardinality(sample.headings), 4,
        jsonb_build_object('id', gen_random_uuid(), 'type', 'signature_block', 'role', 'company')
    ) content;
    insert into public.templates(id, workspace_id, data)
    values (sample_id, new.id, jsonb_build_object(
      'id', sample_id, 'name', sample.name, 'description', sample.description,
      'sample', true, 'active', true, 'signature_heading_defaulted', true,
      'content', blocks, 'cover', sample_cover, 'default_quote', '[]'::jsonb, 'default_items', '[]'::jsonb
    )) on conflict (id) do nothing;
  end loop;
  return new;
end $$;

revoke all on function public.seed_new_workspace_samples() from public, anon, authenticated;
create trigger new_workspace_sample_templates
after insert on public.workspaces
for each row execute function public.seed_new_workspace_samples();
