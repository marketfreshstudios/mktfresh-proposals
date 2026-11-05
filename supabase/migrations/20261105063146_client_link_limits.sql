-- Durable, global abuse counters. Only salted HMACs reach this table; never raw IPs or tokens.
create table public.client_link_limits (
 kind text not null check(kind in ('lookup','password')),
 key_hash text not null check(key_hash ~ '^[0-9a-f]{64}$'),
 window_start timestamptz not null,
 failures integer not null check(failures >= 0),
 primary key(kind,key_hash,window_start)
);
create index client_link_limits_expiry on public.client_link_limits(window_start);
alter table public.client_link_limits enable row level security;
revoke all on public.client_link_limits from public,anon,authenticated;
grant select,insert,update,delete on public.client_link_limits to service_role;

create function public.client_link_limit(bucket_kind text, bucket_hash text, charge boolean default false)
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare seconds integer; cap integer; starts timestamptz; n integer; now_at timestamptz := clock_timestamp();
begin
 if bucket_kind not in ('lookup','password') or bucket_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate-limit bucket'; end if;
 seconds := case when bucket_kind='lookup' then 600 else 900 end;
 cap := case when bucket_kind='lookup' then 30 else 10 end;
 starts := to_timestamp(floor(extract(epoch from now_at)/seconds)*seconds);
 if charge then
  insert into public.client_link_limits(kind,key_hash,window_start,failures) values(bucket_kind,bucket_hash,starts,1)
  on conflict(kind,key_hash,window_start) do update set failures=least(public.client_link_limits.failures+1,cap+1)
  returning failures into n;
 else
  select failures into n from public.client_link_limits where kind=bucket_kind and key_hash=bucket_hash and window_start=starts;
 end if;
 delete from public.client_link_limits where window_start < now_at - interval '1 day';
 if coalesce(n,0) >= cap + (case when charge then 1 else 0 end) then
  return greatest(1,ceil(extract(epoch from (starts + make_interval(secs=>seconds)-now_at)))::integer);
 end if;
 return 0;
end; $$;
revoke all on function public.client_link_limit(text,text,boolean) from public,anon,authenticated;
grant execute on function public.client_link_limit(text,text,boolean) to service_role;
