-- A workspace that stays read-only for 12 months (a trial that ended, a
-- payment that stayed overdue, or a canceled plan) is closed, and closed
-- workspaces are deleted 90 days later. Owners are emailed at least 30 days
-- before a workspace closes. Choosing a plan again clears all of it, even
-- after the workspace has closed.

alter table public.workspaces
  add column if not exists canceled_at timestamptz,
  add column if not exists closure_warning_sent_at timestamptz;

update public.workspaces set canceled_at = now()
 where plan_status = 'canceled' and canceled_at is null;

-- When the plan status changes: remember when a plan was canceled, forget an
-- old closing warning, and reopen a closed workspace that pays again.
create or replace function public.track_workspace_plan() returns trigger
language plpgsql set search_path to '' as $$
begin
  new.canceled_at := case when new.plan_status = 'canceled' then now() end;
  new.closure_warning_sent_at := null;
  if new.plan_status = 'active' then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists workspaces_track_plan on public.workspaces;
create trigger workspaces_track_plan
  before update of plan_status on public.workspaces
  for each row when (old.plan_status is distinct from new.plan_status)
  execute function public.track_workspace_plan();

-- When the workspace became read-only; null while it can still be used.
create or replace function public.workspace_read_only_since(w public.workspaces)
returns timestamptz language sql stable set search_path to '' as $$
  select case w.plan_status
    when 'trial' then w.trial_ends_at
    when 'past_due' then w.past_due_since + interval '7 days'
    when 'canceled' then w.canceled_at
  end
$$;

-- Read-only workspaces that close within 30 days and haven't been warned.
-- closes_at is never sooner than 30 days from now.
create or replace function public.workspaces_due_for_closure_warning()
returns table (id uuid, read_only_since timestamptz, closes_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select w.id,
         public.workspace_read_only_since(w),
         greatest(public.workspace_read_only_since(w) + interval '12 months',
                  now() + interval '30 days')
    from public.workspaces w
   where w.closed_at is null
     and w.closure_warning_sent_at is null
     and public.workspace_read_only_since(w) <= now() - interval '12 months' + interval '30 days'
   order by 3;
$$;

-- Records that the owners were warned. False if the workspace changed since.
create or replace function public.mark_closure_warning_sent(target_workspace uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  update public.workspaces set closure_warning_sent_at = now()
   where id = target_workspace
     and closed_at is null
     and closure_warning_sent_at is null
     and public.workspace_read_only_since(workspaces) is not null;
  return found;
end $$;

-- Read-only for 12 months and warned at least 30 days ago.
create or replace function public.workspaces_due_for_closure()
returns setof uuid language sql stable security definer set search_path to '' as $$
  select w.id from public.workspaces w
   where w.closed_at is null
     and w.closure_warning_sent_at <= now() - interval '30 days'
     and public.workspace_read_only_since(w) <= now() - interval '12 months'
   order by public.workspace_read_only_since(w);
$$;

revoke all on function public.workspace_read_only_since(public.workspaces) from public, anon, authenticated;
revoke all on function public.workspaces_due_for_closure_warning() from public, anon, authenticated;
revoke all on function public.mark_closure_warning_sent(uuid) from public, anon, authenticated;
revoke all on function public.workspaces_due_for_closure() from public, anon, authenticated;
grant execute on function public.workspace_read_only_since(public.workspaces) to service_role;
grant execute on function public.workspaces_due_for_closure_warning() to service_role;
grant execute on function public.mark_closure_warning_sent(uuid) to service_role;
grant execute on function public.workspaces_due_for_closure() to service_role;
