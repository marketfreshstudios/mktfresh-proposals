-- Apply AFTER deploy. The old editor cannot read an unpriced Build choice.
-- MarketFresh catalog and untouched unsent quotes only; never change a version.
begin;

create function pg_temp.website_choice_id(template_id text, key text)
returns uuid language sql immutable as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select md5(template_id||':website-choice:'||key) h) s;
$$;

create function pg_temp.website_quote_line(
  template_id text, product jsonb, row_key text, group_key text,
  parent uuid, row_order integer, required boolean, default_choice boolean
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', pg_temp.website_choice_id(template_id,row_key), 'order',row_order,
    'name',coalesce(nullif(btrim(product->>'display_name'),''),product->>'name'),
    'description',coalesce(product->>'description',''),
    'source','catalog','pricing_item_id',product->>'id','custom_family_id',null,
    'optional',true,'default_selected',default_choice,
    'selected',default_choice and parent is null,
    'choice_group_id',pg_temp.website_choice_id(template_id,group_key),
    'choice_group_required',required,
    'min_term_months',product->'min_term_months','schedule',product->'schedule',
    'plan_terms',product->'plan_terms',
    'sublines',jsonb_build_array(
      coalesce(
        (select subline from jsonb_array_elements(coalesce(product->'sublines','[]')) subline
          where subline->>'interval'=product->>'interval' limit 1),
        jsonb_build_object(
          'amount',product->'amount','interval',product->>'interval','qty',1,
          'stripe_lookup_key',product->'stripe_lookup_key','qbo_item_ref',product->'qbo_item_ref'
        )
      ) || jsonb_build_object('id',pg_temp.website_choice_id(template_id,row_key||':line'),
        'list_amount',product->'amount')
    )
  ) || case when parent is null then '{}' else
    jsonb_build_object('show_when',jsonb_build_object('kind','quote_item','id',parent)) end;
$$;

create function pg_temp.website_plan_content(blocks jsonb, standard_id text)
returns jsonb language sql immutable as $$
  select replace(jsonb_agg(
    case when block->>'type'='contract' and jsonb_typeof(block->'clauses')='array' then
      jsonb_set(block,'{clauses}',coalesce((
        select jsonb_agg(case when clause->>'id'='payment-plan'
            and clause->>'body_format'='oiot_run_in'
            and clause#>>'{show_when,kind}'='item_selected'
            and clause#>>'{show_when,pricing_item_id}'=standard_id
            and md5(clause->>'body')='69a6208ac7824458f821d2ad093efb1b'
          then clause || jsonb_build_object(
            'show_when','{"kind":"oiot_plan_selected"}'::jsonb,
            'body',replace(replace(replace(clause->>'body','$175','{{oiot.monthly}}'),
              '$100','{{oiot.step_down}}'),'Hosting & Care Standard Plan','{{oiot.step_down_plan}}')
          ) else clause end order by clause_index)
        from jsonb_array_elements(block->'clauses') with ordinality as c(clause,clause_index)
      ),'[]'::jsonb))
    else block end order by block_index)::text,
    '[If the client chooses Own It Over Time, add the kickoff as a one-time Custom line with its amount, then delete this note.]',
    '[Enter the agreed kickoff and website purchase price on the Own It Over Time Build option, then delete this note.]'
  )::jsonb
  from jsonb_array_elements(blocks) with ordinality as b(block,block_index);
$$;

do $migration$
declare
  marketfresh constant uuid := '00000000-0000-4000-8000-000000000001';
  pro_schedule constant jsonb := '{"after_paid_invoices":30,"then":{"amount":16400,"lookup_key":"hosted-pro-164"}}';
  standard_schedule constant jsonb := '{"after_paid_invoices":30,"then":{"amount":10000,"lookup_key":"hosted-standard-100"}}';
  catalog jsonb;
  build_product jsonb;
  standard_product jsonb;
  pro_product jsonb;
  care_keys text[] := array['hosted-essentials-25','hosted-lite-64','hosted-standard-100','hosted-pro-164'];
  t record;
  i integer;
  old_quote jsonb;
  new_quote jsonb;
  new_content jsonb;
  now_id uuid;
  plan_id uuid;
  line_json jsonb;
  templates_changed integer := 0;
  drafts_changed integer := 0;
  affected integer;
begin
  update public.pricing_items
    set data = jsonb_set(data,'{schedule}',pro_schedule)
    where workspace_id=marketfresh and data->>'sku'='oiot-pro-monthly-239'
      and data->>'stripe_lookup_key'='oiot-pro-monthly-239' and data->>'interval'='month'
      and data->'amount'='23900'::jsonb and coalesce(data->'schedule','null'::jsonb)='null'::jsonb;
  get diagnostics affected = row_count;
  raise notice 'Pro catalog schedules added: %', affected;

  select jsonb_object_agg(data->>'sku',data) into catalog from public.pricing_items
    where workspace_id=marketfresh and data->>'active'='true' and coalesce(data->>'legacy','false')='false'
      and data->>'sku'=any(care_keys || array['build','oiot-monthly-175','oiot-pro-monthly-239']);
  if catalog is null or not catalog ?& (care_keys || array['build','oiot-monthly-175','oiot-pro-monthly-239']) then
    raise notice 'Skipped website quotes because an approved catalog item is unavailable';
    return;
  end if;
  build_product := catalog->'build';
  standard_product := catalog->'oiot-monthly-175';
  pro_product := catalog->'oiot-pro-monthly-239';
  if standard_product->'amount' is distinct from '17500'::jsonb or
      pro_product->'amount' is distinct from '23900'::jsonb or
      pro_product->'schedule' is distinct from pro_schedule or
      catalog#>'{hosted-standard-100,amount}' is distinct from '10000'::jsonb or
      catalog#>'{hosted-pro-164,amount}' is distinct from '16400'::jsonb then
    raise notice 'Skipped website quotes because a plan price or schedule differs';
    return;
  end if;

  for t in select id,data from public.templates where workspace_id=marketfresh
    and data->>'starter_key'='website-design-build' for update
  loop
    old_quote := t.data->'default_items';
    if jsonb_typeof(old_quote) is distinct from 'array' or jsonb_array_length(old_quote)<2 then continue; end if;
    -- Exact old clause plus the known catalog defaults. Unknown/custom pricing
    -- or a pre-entered kickoff is left for staff review.
    if not exists (
      select 1 from jsonb_array_elements(t.data->'content') b
        cross join lateral jsonb_array_elements(coalesce(b->'clauses','[]')) c
      where c->>'id'='payment-plan' and md5(c->>'body')='69a6208ac7824458f821d2ad093efb1b'
        and c#>>'{show_when,pricing_item_id}'=standard_product->>'id'
    ) or not exists (
      select 1 from jsonb_array_elements(old_quote) q
        where q->>'pricing_item_id'=build_product->>'id'
          and q->>'default_selected'='true' and q->>'optional'='true'
          and q#>'{sublines,0,amount}'=build_product->'amount'
          and q#>>'{sublines,0,interval}'='one_time'
    ) or not exists (
      select 1 from jsonb_array_elements(old_quote) q
        where q->>'pricing_item_id'=standard_product->>'id'
          and q->>'default_selected'='false' and q->>'optional'='true'
          and q#>'{sublines,0,amount}'=standard_product->'amount'
          and q#>>'{sublines,0,interval}'='month'
    ) or exists (
      select 1 from jsonb_array_elements(old_quote) q
      where q ? 'oiot_build' or q ? 'oiot_purchase_price' or q ? 'show_when'
        or coalesce(q->>'ai_entered','false')='true' or jsonb_array_length(q->'sublines')<>1
        or q#>>'{sublines,0,qty}' is distinct from '1'
        or not (
          exists (select 1 from jsonb_each(catalog) p
            where p.key<>'oiot-pro-monthly-239' and p.value->>'id'=q->>'pricing_item_id'
              and q->>'source'='catalog'
              and q->>'name'=coalesce(nullif(btrim(p.value->>'display_name'),''),p.value->>'name')
              and coalesce(q->>'description','')=coalesce(p.value->>'description','')
              and p.value->'amount'=q#>'{sublines,0,amount}'
              and p.value->>'interval'=q#>>'{sublines,0,interval}'
              and q->>'optional'='true'
              and coalesce(q->'schedule','null'::jsonb)=coalesce(p.value->'schedule','null'::jsonb)
              and coalesce(q->'plan_terms','null'::jsonb)=coalesce(p.value->'plan_terms','null'::jsonb)
              and coalesce(q->'min_term_months','null'::jsonb)=coalesce(p.value->'min_term_months','null'::jsonb)
              and (p.key='build' or q->>'default_selected'='false'))
          or (q->>'source'='custom' and q->>'optional'='true' and q#>'{sublines,0,amount}'='0'::jsonb
            and lower(btrim(q->>'name')) in ('included with own it over time','included with own it over time $0'))
        )
    ) then continue; end if;

    now_id := pg_temp.website_choice_id(t.id::text,'own-now');
    plan_id := pg_temp.website_choice_id(t.id::text,'over-time');
    new_quote := jsonb_build_array(
      pg_temp.website_quote_line(t.id::text,build_product,'own-now','build',null,0,true,true),
      jsonb_build_object('id',plan_id,'order',1,'name','Website Build — Own It Over Time',
        'description','','source','custom','pricing_item_id',null,'custom_family_id',null,
        'sublines','[]'::jsonb,'optional',true,'default_selected',false,'selected',false,
        'choice_group_id',pg_temp.website_choice_id(t.id::text,'build'),'choice_group_required',true,
        'min_term_months',null,'schedule',null,'plan_terms',null,'oiot_build',true)
    );
    for i in 1..4 loop
      line_json := pg_temp.website_quote_line(t.id::text,catalog->care_keys[i],
        'own-now-care'||care_keys[i],'own-now-care',now_id,i+1,false,false);
      new_quote := new_quote || jsonb_build_array(line_json);
    end loop;
    line_json := pg_temp.website_quote_line(t.id::text,standard_product,'over-time-care'||(standard_product->>'sku'),
      'over-time-care',plan_id,6,true,true);
    new_quote := new_quote || jsonb_build_array(line_json || jsonb_build_object(
      'name','Own It Over Time — Standard','schedule',standard_schedule,
      'plan_terms',coalesce(nullif(line_json->'plan_terms','null'::jsonb),'{}') || '{"oiot_paid_step_down":true}'));
    line_json := pg_temp.website_quote_line(t.id::text,pro_product,'over-time-care'||(pro_product->>'sku'),
      'over-time-care',plan_id,7,true,false);
    new_quote := new_quote || jsonb_build_array(line_json || jsonb_build_object(
      'name','Own It Over Time — Pro','schedule',pro_schedule,
      'plan_terms',coalesce(nullif(line_json->'plan_terms','null'::jsonb),'{}') || '{"oiot_paid_step_down":true}'));
    new_content := pg_temp.website_plan_content(t.data->'content',standard_product->>'id');

    update public.proposals p set revision=p.revision+1,
      state=(p.state-'pagination') || jsonb_build_object(
        'revision',p.revision+1,'quote',new_quote,
        'content',pg_temp.website_plan_content(p.state->'content',standard_product->>'id'))
      where p.workspace_id=marketfresh and p.source='native' and p.status='draft'
        and p.state->>'template_id'=t.id::text and p.state->'quote'=old_quote
        and p.token is null and coalesce(p.state->>'token',p.state->>'sent_at',p.state->>'client_signed_at',
          p.state->>'completed_at',p.state->>'published_state') is null
        and coalesce(p.state->'versions','[]')='[]'::jsonb and coalesce(p.state->'signers','[]')='[]'::jsonb
        and not exists(select 1 from public.proposal_versions v where v.proposal_id=p.id)
        and exists (select 1 from jsonb_array_elements(p.state->'content') b
          cross join lateral jsonb_array_elements(coalesce(b->'clauses','[]')) c
          where c->>'id'='payment-plan' and md5(c->>'body')='69a6208ac7824458f821d2ad093efb1b'
            and c#>>'{show_when,pricing_item_id}'=standard_product->>'id');
    get diagnostics affected = row_count;
    drafts_changed := drafts_changed + affected;
    update public.templates set data=(data-'pagination') || jsonb_build_object(
      'default_items',new_quote,'content',new_content) where id=t.id;
    templates_changed := templates_changed + 1;
  end loop;
  raise notice 'Website starter templates updated: %, untouched drafts updated: %',templates_changed,drafts_changed;
end $migration$;

drop function pg_temp.website_plan_content(jsonb,text);
drop function pg_temp.website_quote_line(text,jsonb,text,text,uuid,integer,boolean,boolean);
drop function pg_temp.website_choice_id(text,text);
commit;
