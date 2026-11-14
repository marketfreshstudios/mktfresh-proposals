-- Each workspace gets its own address, {slug}.yeswell.co. Null keeps the
-- deployment's single APP_URL, so existing workspaces work unchanged until
-- they are given an address.
alter table public.workspaces add column slug text;
alter table public.workspaces add constraint workspaces_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' and slug !~ '--');
create unique index workspaces_slug_key on public.workspaces (slug);
