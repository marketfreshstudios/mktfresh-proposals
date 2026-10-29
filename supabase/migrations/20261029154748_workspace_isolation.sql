-- Add tenancy without rewriting any frozen evidence JSON.
create table public.workspaces(id uuid primary key, name text not null);
insert into public.workspaces values('00000000-0000-4000-8000-000000000001','Workspace 1');
alter table public.workspaces enable row level security;
alter table public.staff_users add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.staff_users alter column workspace_id drop default;
create index staff_users_workspace on public.staff_users(workspace_id);
alter table public.clients add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.clients alter column workspace_id drop default;
create index clients_workspace on public.clients(workspace_id);
alter table public.pricing_items add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.pricing_items alter column workspace_id drop default;
create index pricing_items_workspace on public.pricing_items(workspace_id);
alter table public.templates add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.templates alter column workspace_id drop default;
create index templates_workspace on public.templates(workspace_id);
alter table public.content_library add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.content_library alter column workspace_id drop default;
create index content_library_workspace on public.content_library(workspace_id);
alter table public.proposals add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.proposals alter column workspace_id drop default;
create index proposals_workspace on public.proposals(workspace_id);
alter table public.proposal_versions add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.proposal_versions alter column workspace_id drop default;
create index proposal_versions_workspace on public.proposal_versions(workspace_id);
alter table public.signers add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.signers alter column workspace_id drop default;
create index signers_workspace on public.signers(workspace_id);
alter table public.events add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.events alter column workspace_id drop default;
create index events_workspace on public.events(workspace_id);
alter table public.files add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.files alter column workspace_id drop default;
create index files_workspace on public.files(workspace_id);
alter table public.billing_links add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.billing_links alter column workspace_id drop default;
create index billing_links_workspace on public.billing_links(workspace_id);
alter table public.jobs add column workspace_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.workspaces(id);
alter table public.jobs alter column workspace_id drop default;
create index jobs_workspace on public.jobs(workspace_id);
alter table public.staff_users add column role text not null default 'member' check(role in ('owner','member'));
alter table public.clients drop constraint clients_email_key;
alter table public.clients add unique(workspace_id,email);
alter table public.clients add unique(workspace_id,id);
alter table public.pricing_items drop constraint pricing_items_sku_key;
alter table public.pricing_items add unique(workspace_id,sku);
alter table public.proposals add unique(workspace_id,id);
alter table public.proposals add foreign key(workspace_id,client_id) references public.clients(workspace_id,id);
alter table public.proposal_versions add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
alter table public.signers add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
alter table public.events add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
alter table public.files add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
alter table public.billing_links add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
alter table public.jobs add foreign key(workspace_id,proposal_id) references public.proposals(workspace_id,id);
create table public.workspace_settings(id uuid primary key, workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create index workspace_settings_workspace on public.workspace_settings(workspace_id);
alter table public.workspace_settings enable row level security;
create table public.workspace_documents(id uuid primary key, workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create index workspace_documents_workspace on public.workspace_documents(workspace_id);
alter table public.workspace_documents enable row level security;
create table public.custom_families(id uuid primary key, workspace_id uuid not null references public.workspaces(id),data jsonb not null);
create index custom_families_workspace on public.custom_families(workspace_id);
alter table public.custom_families enable row level security;
alter table public.workspace_settings add unique(workspace_id);
drop policy staff_read on public.clients;
drop policy staff_read on public.pricing_items;
drop policy staff_read on public.templates;
drop policy staff_read on public.content_library;
drop policy staff_read on public.proposals;
drop policy staff_read on public.proposal_versions;
drop policy staff_read on public.signers;
drop policy staff_read on public.events;
drop policy staff_read on public.files;
drop policy staff_read on public.billing_links;
drop policy staff_read on public.jobs;
create policy workspace_read on public.clients for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.clients from anon,authenticated;
grant select on public.clients to authenticated;
grant all on public.clients to service_role;
create policy workspace_read on public.pricing_items for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.pricing_items from anon,authenticated;
grant select on public.pricing_items to authenticated;
grant all on public.pricing_items to service_role;
create policy workspace_read on public.templates for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.templates from anon,authenticated;
grant select on public.templates to authenticated;
grant all on public.templates to service_role;
create policy workspace_read on public.content_library for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.content_library from anon,authenticated;
grant select on public.content_library to authenticated;
grant all on public.content_library to service_role;
create policy workspace_read on public.proposals for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.proposals from anon,authenticated;
grant select on public.proposals to authenticated;
grant all on public.proposals to service_role;
create policy workspace_read on public.proposal_versions for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.proposal_versions from anon,authenticated;
grant select on public.proposal_versions to authenticated;
grant all on public.proposal_versions to service_role;
create policy workspace_read on public.signers for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.signers from anon,authenticated;
grant select on public.signers to authenticated;
grant all on public.signers to service_role;
create policy workspace_read on public.events for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.events from anon,authenticated;
grant select on public.events to authenticated;
grant all on public.events to service_role;
create policy workspace_read on public.files for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.files from anon,authenticated;
grant select on public.files to authenticated;
grant all on public.files to service_role;
create policy workspace_read on public.billing_links for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.billing_links from anon,authenticated;
grant select on public.billing_links to authenticated;
grant all on public.billing_links to service_role;
create policy workspace_read on public.jobs for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.jobs from anon,authenticated;
grant select on public.jobs to authenticated;
grant all on public.jobs to service_role;
create policy workspace_read on public.workspace_settings for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.workspace_settings from anon,authenticated;
grant select on public.workspace_settings to authenticated;
grant all on public.workspace_settings to service_role;
create policy workspace_read on public.workspace_documents for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.workspace_documents from anon,authenticated;
grant select on public.workspace_documents to authenticated;
grant all on public.workspace_documents to service_role;
create policy workspace_read on public.custom_families for select to authenticated using(workspace_id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.custom_families from anon,authenticated;
grant select on public.custom_families to authenticated;
grant all on public.custom_families to service_role;
create policy workspace_read on public.workspaces for select to authenticated using(id in(select workspace_id from public.staff_users where user_id=(select auth.uid())));
revoke all on public.workspaces from anon,authenticated;
grant select on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
-- Membership is self-visible only; the workspace is never taken from user-editable claims.
create or replace function public.save_proposal(document jsonb,expected_revision integer) returns void language plpgsql security invoker set search_path='' as $$
declare old_state jsonb; x jsonb; pid uuid := (document->>'id')::uuid; wid uuid := (document->>'workspace_id')::uuid;
begin
 if wid is null then raise exception 'Workspace required'; end if;
 if exists(select 1 from public.proposals where id=pid and workspace_id<>wid) then raise exception 'Workspace mismatch'; end if;
 select state into old_state from public.proposals where id=pid for update;
 if coalesce((old_state->>'revision')::integer,-1)<>expected_revision or (document->>'revision')::integer<>expected_revision+1 then raise exception 'Revision conflict' using errcode='40001';end if;
 if old_state is not null then
  -- Preserve audit prefix and every prior sealed record, including inside the aggregate.
  if not ((document->'events') @> (old_state->'events')) or not((document->'signers') @> (old_state->'signers')) or not((document->'files') @> (old_state->'files')) then raise exception 'Immutable evidence removed';end if;
  for x in select value from jsonb_array_elements(old_state->'versions') loop
   if (x->>'frozen')::boolean and not((document->'versions') @> jsonb_build_array(x)) then raise exception 'Frozen evidence changed';end if;
  end loop;
 end if;
 insert into public.proposals(id,revision,state,client_id,title,status,token,source,proposify_id,created_at,updated_at,search_text,workspace_id)
 values(pid,(document->>'revision')::integer,document,(document->'client'->>'id')::uuid,document->>'title',document->>'status',document->>'token',document->>'source',document->>'proposify_id',(document->>'created_at')::timestamptz,(document->>'updated_at')::timestamptz,concat_ws(' ',document->>'title',document->'client'->>'company',document->'client'->>'email',document->>'search_text'),wid)
 on conflict(id) do update set revision=excluded.revision,state=excluded.state,client_id=excluded.client_id,title=excluded.title,status=excluded.status,token=excluded.token,updated_at=excluded.updated_at,search_text=excluded.search_text;
 for x in select value from jsonb_array_elements(document->'versions') loop
 insert into public.proposal_versions(id,proposal_id,version_no,data,workspace_id) values((x->>'id')::uuid,pid,(x->>'version_no')::integer,x,wid) on conflict(id) do update set data=excluded.data where proposal_versions.data is distinct from excluded.data;
 end loop;
 for x in select value from jsonb_array_elements(document->'events') loop
 insert into public.events(id,proposal_id,type,actor,created_at,data,workspace_id) values((x->>'id')::uuid,pid,x->>'type',x->>'actor',(x->>'created_at')::timestamptz,x,wid) on conflict(id) do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'signers') loop
 insert into public.signers(proposal_id,role,data,workspace_id) values(pid,x->>'role',x,wid) on conflict do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'files') loop
 insert into public.files(id,proposal_id,kind,storage_path,sha256,data,workspace_id) values((x->>'id')::uuid,pid,x->>'kind',x->>'storage_path',x->>'sha256',x,wid) on conflict do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'billing_links') loop
 insert into public.billing_links(proposal_id,provider,status,data,workspace_id) values(pid,x->>'provider',x->>'status',x,wid) on conflict(proposal_id,provider) do update set status=excluded.status,data=excluded.data;end loop;
 for x in select value from jsonb_array_elements(document->'jobs') loop
 insert into public.jobs(id,proposal_id,status,available_at,data,workspace_id) values(x->>'id',pid,x->>'status',(x->>'available_at')::timestamptz,x,wid) on conflict(id) do update set status=excluded.status,available_at=excluded.available_at,data=excluded.data;end loop;
end $$;
revoke all on function public.save_proposal(jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_proposal(jsonb,integer) to service_role;

-- Prevent a privileged accidental upsert from moving an existing entity between tenants.
create function public.protect_workspace() returns trigger language plpgsql set search_path='' as $$
begin if old.workspace_id is distinct from new.workspace_id then raise exception 'Workspace is immutable'; end if; return new; end $$;
do $$ declare t text; begin foreach t in array array['staff_users','clients','pricing_items','templates','content_library','proposals','proposal_versions','signers','events','files','billing_links','jobs','workspace_settings','workspace_documents','custom_families'] loop
execute format('create trigger immutable_workspace before update on public.%I for each row execute function public.protect_workspace()',t);
end loop; end $$;
