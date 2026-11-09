-- Run against a disposable Supabase Postgres database after applying the migration.
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.auth_reset_requests;
    raise exception 'anon can read reset requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admit_staff_password_reset(repeat('a', 64), repeat('b', 64));
    raise exception 'anon can call the rate limiter';
  exception when insufficient_privilege then null;
  end;
end $$;
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.auth_reset_requests;
    raise exception 'authenticated can read reset requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admit_staff_password_reset(repeat('a', 64), repeat('b', 64));
    raise exception 'authenticated can call the rate limiter';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role service_role;
do $$
declare n integer;
begin
  insert into public.auth_reset_requests(email_hash, ip_hash, created_at)
    values (repeat('d',64), repeat('e',64), now() - interval '25 hours');
  for n in 1..3 loop
    if not public.admit_staff_password_reset(repeat('a',64), lpad(to_hex(n),64,'0'))
    then raise exception 'email limit blocked too early'; end if;
  end loop;
  if public.admit_staff_password_reset(repeat('a',64), repeat('b',64))
    then raise exception 'fourth request for one email was admitted'; end if;
  for n in 1..10 loop
    if not public.admit_staff_password_reset(lpad(to_hex(n),64,'0'), repeat('c',64))
    then raise exception 'IP limit blocked too early'; end if;
  end loop;
  if public.admit_staff_password_reset(repeat('f',64), repeat('c',64))
    then raise exception 'eleventh request for one IP was admitted'; end if;
  if exists (select 1 from public.auth_reset_requests where email_hash = repeat('d',64))
    then raise exception 'old reset request was retained'; end if;
end $$;
rollback;
