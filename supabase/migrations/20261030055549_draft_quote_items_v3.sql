-- Pure conversion utility. Neither versions nor signed proposal state are inputs to the UPDATE.
create or replace function public.quote_items_v3(lines jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare l jsonb; result jsonb := '[]'::jsonb; n integer := 0; required boolean; amount jsonb; pricing jsonb;
begin
 if jsonb_typeof(lines) is distinct from 'array' then raise exception 'Draft quote must be an array'; end if;
 for l in select value from jsonb_array_elements(lines) loop
  if l ? 'sublines' then result := result || jsonb_build_array(l); n := n+1; continue; end if;
  if not (l ? 'id') then raise exception 'Draft quote item has no identity'; end if;
  amount := coalesce(l->'amount',l->'unit_price');
  if amount is null or jsonb_typeof(amount) is distinct from 'number' then raise exception 'Draft quote item has no amount'; end if;
  required := not coalesce((l->>'optional')::boolean,false);
  pricing := case when l ? 'pricing_item_id' then l->'pricing_item_id' when l ? 'unit_price' then l->'id' else 'null'::jsonb end;
  result := result || jsonb_build_array(jsonb_build_object(
   'id',l->'id','order',n,'name',l->'name','description',coalesce(l->'description','""'::jsonb),
   'source',case when pricing <> 'null'::jsonb then 'catalog' else 'custom' end,
   'pricing_item_id',pricing,'custom_family_id',coalesce(l->'custom_family_id','null'::jsonb),
   'sublines',jsonb_build_array(jsonb_build_object('id',l->'id','amount',amount,'list_amount',coalesce(l->'list_amount',case when l ? 'unit_price' then amount else 'null'::jsonb end),
     'interval',coalesce(l->'interval',case when l->>'billing'='monthly' then '"month"'::jsonb else '"one_time"'::jsonb end),
     'qty',coalesce(l->'qty','1'::jsonb),'stripe_lookup_key',coalesce(l->'stripe_lookup_key','null'::jsonb),
     'qbo_item_ref',coalesce(l->'qbo_item_ref',l->'qbo_item_id','null'::jsonb))),
   'optional',not required,'default_selected',required or coalesce((l->>'selected')::boolean,false),'selected',required or coalesce((l->>'selected')::boolean,false),
   'choice_group_id',null,'min_term_months',coalesce(l->'min_term_months','null'::jsonb),'schedule',coalesce(l->'schedule','null'::jsonb),'plan_terms',coalesce(l->'plan_terms','null'::jsonb),'legacy_group',coalesce(l->'group','null'::jsonb)
  ));
  n := n+1;
 end loop;
 return result;
end $$;
revoke all on function public.quote_items_v3(jsonb) from public,anon,authenticated;
grant execute on function public.quote_items_v3(jsonb) to service_role;

do $$
declare r record; document jsonb; converted jsonb; stamp text;
begin
 for r in select id,revision,state from public.proposals where status='draft' and state->>'quote_model_version' is distinct from '3' order by id for update loop
  converted := public.quote_items_v3(r.state->'quote');
  stamp := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  document := r.state || jsonb_build_object('quote',converted,'quote_model_version',3,'revision',r.revision+1,'updated_at',stamp);
  document := jsonb_set(document,'{events}',coalesce(document->'events','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id',gen_random_uuid(),'type','draft_quote_migrated','actor','system','ip','','user_agent','','created_at',stamp,
    'metadata',jsonb_build_object('quote_model_version',3,'items',jsonb_array_length(converted))
  )));
  perform public.save_proposal(document,r.revision);
 end loop;
end $$;
