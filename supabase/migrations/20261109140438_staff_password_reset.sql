-- Public requests are admitted by one transaction shared by all app instances.
create table public.auth_reset_requests (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null
);
alter table public.auth_reset_requests enable row level security;
revoke all on public.auth_reset_requests from public, anon, authenticated;
grant select, insert, delete on public.auth_reset_requests to service_role;
create index auth_reset_requests_email_time on public.auth_reset_requests (email_hash, created_at);
create index auth_reset_requests_ip_time on public.auth_reset_requests (ip_hash, created_at);
create index auth_reset_requests_retention on public.auth_reset_requests (created_at);

create function public.admit_staff_password_reset(target_email_hash text, target_ip_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare checked_at timestamptz;
begin
  if target_email_hash is null or target_email_hash !~ '^[0-9a-f]{64}$'
    or target_ip_hash is null or target_ip_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid reset rate-limit key';
  end if;
  -- Use separate namespaces and a fixed lock order, including for shared IPs.
  perform pg_catalog.pg_advisory_xact_lock(94129, pg_catalog.hashtext(target_email_hash));
  perform pg_catalog.pg_advisory_xact_lock(94130, pg_catalog.hashtext(target_ip_hash));
  checked_at := pg_catalog.clock_timestamp();
  delete from public.auth_reset_requests where created_at < checked_at - interval '24 hours';
  if (select count(*) from public.auth_reset_requests
      where email_hash = target_email_hash and created_at > checked_at - interval '1 hour') >= 3
    or (select count(*) from public.auth_reset_requests
      where ip_hash = target_ip_hash and created_at > checked_at - interval '1 hour') >= 10
  then
    return false;
  end if;
  insert into public.auth_reset_requests(email_hash, ip_hash, created_at)
    values (target_email_hash, target_ip_hash, checked_at);
  return true;
end $$;
revoke all on function public.admit_staff_password_reset(text, text) from public, anon, authenticated;
grant execute on function public.admit_staff_password_reset(text, text) to service_role;
