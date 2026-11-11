-- Apply before deploying subscription linking. Uses the existing proposal RLS
-- and grants. One subscription can be adopted once in a workspace, even when
-- two staff members submit at the same time.
alter table public.proposals add column adopted_stripe_subscription_id text
  generated always as (
    jsonb_path_query_first(state, '$.billing_links[*] ? (@.provider == "stripe").metadata.adopted_subscription.id') #>> '{}'
  ) stored;

create unique index proposals_adopted_stripe_subscription
  on public.proposals (workspace_id, adopted_stripe_subscription_id)
  where adopted_stripe_subscription_id is not null;
