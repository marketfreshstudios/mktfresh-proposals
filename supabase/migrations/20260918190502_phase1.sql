-- JSON aggregate is authoritative; relational projections are updated in the same CAS transaction.
-- The application service role is the sole writer. Staff have read-only RLS access.
create table public.staff_users (user_id uuid primary key references auth.users(id));
alter table public.staff_users enable row level security;
create policy self_read on public.staff_users for select to authenticated using(user_id=(select auth.uid()));
grant select on public.staff_users to authenticated;
create table public.clients(id uuid primary key, data jsonb not null, email text generated always as (lower(data->>'email')) stored unique, created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.pricing_items(id uuid primary key,data jsonb not null,sku text generated always as(data->>'sku') stored unique);
create table public.templates(id uuid primary key,data jsonb not null);
create table public.content_library(id uuid primary key,data jsonb not null);
create table public.proposals(
 id uuid primary key, revision integer not null, state jsonb not null,
 client_id uuid not null references public.clients(id),
 title text not null,status text not null check(status in('draft','sent','viewed','signed_by_client','completed','declined','expired','archived')),
 token text unique, source text not null check(source in('native','proposify_import')),proposify_id text unique,
 created_at timestamptz not null,updated_at timestamptz not null,
 search_text text not null default '',search_document tsvector generated always as(to_tsvector('english',search_text)) stored
);
create index proposals_search on public.proposals using gin(search_document);
create index proposals_filter on public.proposals(status,client_id,created_at);
create table public.proposal_versions(id uuid primary key,proposal_id uuid not null references public.proposals(id),version_no integer not null,data jsonb not null,unique(proposal_id,version_no));
create table public.signers(proposal_id uuid not null references public.proposals(id),role text not null check(role in('client','company')),data jsonb not null,primary key(proposal_id,role));
create table public.events(id uuid primary key,proposal_id uuid not null references public.proposals(id),type text not null,actor text not null,created_at timestamptz not null,data jsonb not null);
create table public.files(id uuid primary key,proposal_id uuid not null references public.proposals(id),kind text not null,storage_path text not null unique,sha256 text not null,data jsonb not null);
create table public.billing_links(proposal_id uuid not null references public.proposals(id),provider text not null check(provider in('qbo','stripe')),status text not null,data jsonb not null,primary key(proposal_id,provider));
create table public.jobs(id text primary key,proposal_id uuid not null references public.proposals(id),status text not null,available_at timestamptz not null,data jsonb not null);
create index jobs_pending on public.jobs(status,available_at);
create function public.reject_mutation() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Append-only record'; end $$;
create trigger immutable_events before update or delete on public.events for each row execute function public.reject_mutation();
create trigger immutable_files before update or delete on public.files for each row execute function public.reject_mutation();
create trigger immutable_signers before update or delete on public.signers for each row execute function public.reject_mutation();
create function public.protect_version() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' or (old.data->>'frozen')::boolean then raise exception 'Frozen version is immutable'; end if;return new;end $$;
create trigger frozen_versions before update or delete on public.proposal_versions for each row execute function public.protect_version();
do $$ declare t text;begin foreach t in array array['clients','pricing_items','templates','content_library','proposals','proposal_versions','signers','events','files','billing_links','jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy staff_read on public.%I for select to authenticated using(exists(select 1 from public.staff_users where user_id=(select auth.uid())))',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
 end loop;end $$;
grant all on all tables in schema public to service_role;
create function public.save_proposal(document jsonb,expected_revision integer) returns void language plpgsql security invoker set search_path='' as $$
declare old_state jsonb; x jsonb; pid uuid := (document->>'id')::uuid;
begin
 select state into old_state from public.proposals where id=pid for update;
 if coalesce((old_state->>'revision')::integer,-1)<>expected_revision or (document->>'revision')::integer<>expected_revision+1 then raise exception 'Revision conflict' using errcode='40001';end if;
 if old_state is not null then
  -- Preserve audit prefix and every prior sealed record, including inside the aggregate.
  if not (document->'events' @> old_state->'events') or not(document->'signers' @> old_state->'signers') or not(document->'files' @> old_state->'files') then raise exception 'Immutable evidence removed';end if;
  for x in select value from jsonb_array_elements(old_state->'versions') loop
   if (x->>'frozen')::boolean and not(document->'versions' @> jsonb_build_array(x)) then raise exception 'Frozen evidence changed';end if;
  end loop;
 end if;
 insert into public.proposals(id,revision,state,client_id,title,status,token,source,proposify_id,created_at,updated_at,search_text)
 values(pid,(document->>'revision')::integer,document,(document->'client'->>'id')::uuid,document->>'title',document->>'status',document->>'token',document->>'source',document->>'proposify_id',(document->>'created_at')::timestamptz,(document->>'updated_at')::timestamptz,concat_ws(' ',document->>'title',document->'client'->>'company',document->'client'->>'email',document->>'search_text'))
 on conflict(id) do update set revision=excluded.revision,state=excluded.state,title=excluded.title,status=excluded.status,token=excluded.token,updated_at=excluded.updated_at,search_text=excluded.search_text;
 for x in select value from jsonb_array_elements(document->'versions') loop
 insert into public.proposal_versions values((x->>'id')::uuid,pid,(x->>'version_no')::integer,x) on conflict(id) do update set data=excluded.data where proposal_versions.data is distinct from excluded.data;
 end loop;
 for x in select value from jsonb_array_elements(document->'events') loop
 insert into public.events values((x->>'id')::uuid,pid,x->>'type',x->>'actor',(x->>'created_at')::timestamptz,x) on conflict(id) do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'signers') loop
 insert into public.signers values(pid,x->>'role',x) on conflict do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'files') loop
 insert into public.files values((x->>'id')::uuid,pid,x->>'kind',x->>'storage_path',x->>'sha256',x) on conflict do nothing;end loop;
 for x in select value from jsonb_array_elements(document->'billing_links') loop
 insert into public.billing_links values(pid,x->>'provider',x->>'status',x) on conflict(proposal_id,provider) do update set status=excluded.status,data=excluded.data;end loop;
 for x in select value from jsonb_array_elements(document->'jobs') loop
 insert into public.jobs values(x->>'id',pid,x->>'status',(x->>'available_at')::timestamptz,x) on conflict(id) do update set status=excluded.status,available_at=excluded.available_at,data=excluded.data;end loop;
end $$;
revoke all on function public.save_proposal(jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_proposal(jsonb,integer) to service_role;
insert into storage.buckets(id,name,public) values('proposal-files','proposal-files',false) on conflict(id) do nothing;
-- No public Storage policies: downloads are authorized by the application token/staff routes.
