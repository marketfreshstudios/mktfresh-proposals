create table public.oauth_records(id uuid primary key,workspace_id uuid not null references public.workspaces(id),kind text not null check(kind in('client','code','grant','token')),hash text not null unique,data jsonb not null);
create index oauth_records_workspace on public.oauth_records(workspace_id);
create index oauth_refresh on public.oauth_records((data->>'refresh_hash'));
alter table public.oauth_records enable row level security;
revoke all on public.oauth_records from anon,authenticated;
grant all on public.oauth_records to service_role;
create trigger immutable_workspace before update on public.oauth_records for each row execute function public.protect_workspace();
create function public.consume_oauth_record(record_id uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.oauth_records set data=jsonb_set(data,'{used}','true') where id=record_id and coalesce((data->>'used')::boolean,false)=false;
 return found;
end $$;
revoke all on function public.consume_oauth_record(uuid) from public,anon,authenticated;
grant execute on function public.consume_oauth_record(uuid) to service_role;
create table public.workspace_events(id uuid primary key,workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create index workspace_events_workspace on public.workspace_events(workspace_id);
alter table public.workspace_events enable row level security;
revoke all on public.workspace_events from anon,authenticated;
grant select on public.workspace_events to authenticated;
grant all on public.workspace_events to service_role;
create policy workspace_read on public.workspace_events for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
create trigger immutable_events before update or delete on public.workspace_events for each row execute function public.reject_mutation();

create function public.touch_oauth_grant(record_id uuid,used_at text) returns void language sql security invoker set search_path='' as $$update public.oauth_records set data=jsonb_set(data,'{last_used}',to_jsonb(used_at)) where id=record_id and kind='grant'$$;
revoke all on function public.touch_oauth_grant(uuid,text) from public,anon,authenticated;
grant execute on function public.touch_oauth_grant(uuid,text) to service_role;
