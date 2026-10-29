-- Upgrade editable catalogue defaults only. Never rewrite proposal/version evidence.
-- Old Stripe price IDs cannot identify lookup keys; a catalogue sync must supply them.
update public.pricing_items set data =
 (data - 'unit_price' - 'billing' - 'stripe_price_id' - 'qbo_item_id') ||
 jsonb_build_object('amount',data->'unit_price','interval',case when data->>'billing'='monthly' then 'month' else 'one_time' end,
 'stripe_lookup_key',null,'qbo_item_ref',data->'qbo_item_id','legacy',not coalesce((data->>'active')::boolean,true),
 'min_term_months',null,'schedule',null,'plan_terms',null)
where not(data ? 'amount') and data ? 'unit_price';
