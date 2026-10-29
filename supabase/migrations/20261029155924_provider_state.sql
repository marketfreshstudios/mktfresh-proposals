create table public.provider_actions(id uuid primary key, workspace_id uuid not null references public.workspaces(id), data jsonb not null);
create table public.provider_credentials(id uuid primary key, workspace_id uuid not null references public.workspaces(id), data jsonb not null);
create table public.webhook_events(id uuid primary key, workspace_id uuid not null references public.workspaces(id), data jsonb not null);
do $$ declare t text; begin foreach t in array array['provider_actions','provider_credentials','webhook_events'] loop
execute format('alter table public.%I enable row level security',t);
execute format('create index %I on public.%I(workspace_id)',t||'_workspace',t);
execute format('revoke all on public.%I from anon,authenticated',t);
execute format('grant all on public.%I to service_role',t);
execute format('create trigger immutable_workspace before update on public.%I for each row execute function public.protect_workspace()',t);
end loop; end $$;
-- Credentials and webhook receipts intentionally have no staff or public read policy.
