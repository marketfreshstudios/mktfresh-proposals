-- Yeswell's own billing (studios paying for Yeswell), on MarketFresh's Stripe
-- in test mode. Stripe is the source of truth; these columns mirror the
-- workspace's subscription so the app can show it and gate access.
alter table public.workspaces
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column subscription jsonb,
  add column launch_price boolean not null default false;

-- Stripe events already handled, so a replayed event never repeats an email.
create table public.yeswell_billing_events (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);
alter table public.yeswell_billing_events enable row level security;
revoke all on public.yeswell_billing_events from public, anon, authenticated;
grant all on public.yeswell_billing_events to service_role;

create function public.claim_yeswell_billing_event(event_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.yeswell_billing_events (id) values (event_id) on conflict do nothing;
  return found;
end $$;
revoke all on function public.claim_yeswell_billing_event(text) from public, anon, authenticated;
grant execute on function public.claim_yeswell_billing_event(text) to service_role;

-- How many launch-price spots are left (first 25 paying studios).
create function public.launch_spots_left()
returns integer language sql stable security invoker set search_path = '' as $$
  select greatest(0, 25 - (select count(*)::int from public.workspaces where launch_price))
$$;
revoke all on function public.launch_spots_left() from public, anon, authenticated;
grant execute on function public.launch_spots_left() to service_role;

-- Applies a subscription as Stripe reports it. status is Stripe's status.
-- A paying subscription takes a launch-price spot while any are left.
create function public.sync_workspace_subscription(
  target_workspace uuid, customer text, subscription_id text, stripe_status text, details jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare current public.workspaces; next_status text;
begin
  select * into current from public.workspaces where id = target_workspace for update;
  if not found then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  if current.stripe_customer_id is distinct from customer then
    raise exception 'Customer does not belong to this workspace' using errcode = '42501';
  end if;
  if current.stripe_subscription_id is not null and current.stripe_subscription_id <> subscription_id
    and stripe_status not in ('active', 'trialing', 'past_due', 'unpaid') then
    return current.plan_status; -- an old subscription ending doesn't touch the current one
  end if;
  next_status := case
    when stripe_status in ('active', 'trialing') then 'active'
    when stripe_status in ('past_due', 'unpaid') then 'past_due'
    when stripe_status in ('canceled', 'incomplete_expired') then 'canceled'
    else current.plan_status end;
  if next_status = 'active' and not current.launch_price then
    perform pg_catalog.pg_advisory_xact_lock(94150, 0);
    if (select count(*) from public.workspaces where launch_price) < 25 then
      update public.workspaces set launch_price = true where id = target_workspace;
    end if;
  end if;
  update public.workspaces set
    stripe_subscription_id = subscription_id,
    subscription = details,
    plan_status = next_status,
    past_due_since = case when next_status = 'past_due' then coalesce(past_due_since, now()) else null end
  where id = target_workspace;
  return next_status;
end $$;
revoke all on function public.sync_workspace_subscription(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_workspace_subscription(uuid, text, text, text, jsonb) to service_role;
