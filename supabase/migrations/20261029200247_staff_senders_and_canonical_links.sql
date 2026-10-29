-- Editable staff profile only; membership and role remain service-managed.
alter table public.staff_users add column display_name text;
update public.staff_users s set display_name = left(regexp_replace(coalesce(
 nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
 nullif(btrim(u.raw_user_meta_data->>'name'),''), nullif(u.email,''), 'Staff'
), E'[\\r\\n]+', ' ', 'g'),200) from auth.users u where u.id=s.user_id;
alter table public.staff_users alter column display_name set not null;
alter table public.staff_users add constraint staff_display_name_valid
 check(length(btrim(display_name)) between 1 and 200 and display_name !~ E'[\\r\\n]');
create function public.seed_staff_display_name() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if new.display_name is null or btrim(new.display_name)='' then
  select left(regexp_replace(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
    nullif(btrim(u.raw_user_meta_data->>'name'),''),nullif(u.email,''),'Staff'), E'[\r\n]+',' ','g'),200)
  into new.display_name from auth.users u where u.id=new.user_id;
 end if;
 return new;
end; $$;
revoke all on function public.seed_staff_display_name() from public,anon,authenticated;
grant execute on function public.seed_staff_display_name() to service_role;
create trigger seed_staff_display_name before insert or update of display_name on public.staff_users
 for each row execute function public.seed_staff_display_name();
-- Do not update proposals.state or proposal_versions: historical URLs/senders survive.
update public.workspace_settings set data =
 (data - 'client_url' - 'email_sender_name' - 'email_sender_address') ||
 jsonb_build_object('sending_domain',coalesce(data->>'sending_domain',''));
