-- Stripe account routing uses an account digest. The account ID and mode are
-- encrypted by the app inside the existing service-only credential row.
create unique index stripe_connect_account_routing
  on public.provider_credentials ((data->>'account_hash'))
  where data->>'kind' = 'stripe_connect';
