-- Editable workspace defaults; sent content is stored separately and never updated.
create table public.email_templates(id uuid primary key,workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create unique index email_templates_workspace_key on public.email_templates(workspace_id,(data->>'key'));
create table public.email_log(id uuid primary key,workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create index email_log_proposal on public.email_log(workspace_id,(data->>'proposal_id'));
alter table public.email_templates enable row level security;
alter table public.email_log enable row level security;
revoke all on public.email_templates,public.email_log from anon,authenticated;
grant select on public.email_templates,public.email_log to authenticated;
grant all on public.email_templates,public.email_log to service_role;
create policy workspace_read on public.email_templates for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
create policy workspace_read on public.email_log for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
create trigger immutable_email_log before update or delete on public.email_log for each row execute function public.reject_mutation();
-- One transaction stores the template and its small, append-only activity entry.
create function public.save_email_template(target_workspace uuid,template jsonb,audit_event jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(audit_event->>'actor','') not like 'staff:%' or audit_event->>'type' is distinct from 'email_template_saved' or template->>'key' is distinct from audit_event->'metadata'->>'key' or template->>'version_id' is distinct from audit_event->'metadata'->>'version_id' then
    raise exception 'Staff template audit required' using errcode='42501';
  end if;
  insert into public.email_templates(id,workspace_id,data) values((template->>'id')::uuid,target_workspace,template)
  on conflict(id) do update set data=excluded.data where public.email_templates.workspace_id=target_workspace;
  if not found then raise exception 'Template not found' using errcode='P0002'; end if;
  insert into public.workspace_events(id,workspace_id,data) values((audit_event->>'id')::uuid,target_workspace,audit_event);
end $$;
revoke all on function public.save_email_template(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_email_template(uuid,jsonb,jsonb) to service_role;
