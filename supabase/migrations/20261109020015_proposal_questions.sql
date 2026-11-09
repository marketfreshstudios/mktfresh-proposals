-- Apply before deploying proposal Q&A. Public clients use the existing token API.
create table public.proposal_questions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  created_at timestamptz not null,
  status text generated always as (data->>'status') stored not null
    check (status in ('open', 'answered', 'resolved')),
  data jsonb not null
);
create index proposal_questions_record on public.proposal_questions(workspace_id, proposal_id, created_at desc);
create index proposal_questions_open on public.proposal_questions(workspace_id, proposal_id) where status = 'open';

create table public.proposal_question_mail (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  attempt integer not null default 0,
  available_at timestamptz,
  snapshot jsonb not null
);
create index proposal_question_mail_due on public.proposal_question_mail(workspace_id, available_at)
  where available_at is not null;

alter table public.proposal_questions enable row level security;
alter table public.proposal_question_mail enable row level security;
revoke all on public.proposal_questions, public.proposal_question_mail from public, anon, authenticated;
grant select, insert, update on public.proposal_questions, public.proposal_question_mail to service_role;

create function public.write_proposal_question(
  p_workspace uuid, p_previous integer, p_proposal_revision integer,
  p_thread jsonb, p_mail jsonb
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  proposal uuid := (p_thread->>'proposal_id')::uuid;
  question uuid := (p_thread->>'id')::uuid;
  stamp timestamptz := (p_thread->>'created_at')::timestamptz;
  doc jsonb;
  old_thread jsonb;
  expires timestamptz;
  closed boolean;
begin
  -- Serialize the hourly limit and the write against signing/closing. The proposal row is never updated.
  select state into doc from public.proposals where workspace_id=p_workspace and id=proposal for update;
  if not found then return 'closed'; end if;
  expires := (case when doc->>'published_state' is not null then doc#>>'{published_state,valid_until}'
                   else doc->>'valid_until' end)::timestamptz;
  closed := doc->>'token' is null or doc->>'source' <> 'native' or doc->>'archived_at' is not null
    or doc->>'status' not in ('sent','viewed','signed_by_client','completed')
    or (doc->>'status' in ('sent','viewed') and expires is not null and expires <= clock_timestamp());
  select data into old_thread from public.proposal_questions
    where workspace_id=p_workspace and proposal_id=proposal and id=question;
  if p_previous is null then
    if old_thread is not null or (doc->>'revision')::integer is distinct from p_proposal_revision then
      return 'stale';
    end if;
    if closed or doc->>'status' not in ('sent','viewed')
      or jsonb_array_length(doc->'signers') > 0 then return 'closed'; end if;
    if (select count(*) from public.proposal_questions
        where workspace_id=p_workspace and proposal_id=proposal
        and created_at > statement_timestamp() - interval '1 hour') >= 10 then return 'limited'; end if;
    insert into public.proposal_questions(id,workspace_id,proposal_id,created_at,data)
      values(question,p_workspace,proposal,stamp,p_thread);
    -- A separate event survives view session races. A question is never a qualified view.
    insert into public.proposal_engagement(id,workspace_id,proposal_id,started_at,data)
      values(gen_random_uuid(),p_workspace,proposal,stamp,
        jsonb_build_object('kind','question','question_id',question,'proposal_id',proposal,
          'started_at',stamp,'count_view',false,'seq',100001));
  else
    if old_thread is null or (old_thread->>'revision')::integer <> p_previous
      or (p_proposal_revision is not null and (doc->>'revision')::integer <> p_proposal_revision) then return 'stale'; end if;
    if p_proposal_revision is not null and closed then return 'closed'; end if;
    update public.proposal_questions set data=p_thread
      where workspace_id=p_workspace and proposal_id=proposal and id=question;
  end if;
  insert into public.proposal_question_mail(id,workspace_id,proposal_id,available_at,snapshot)
    select (mail->>'id')::uuid,p_workspace,proposal,statement_timestamp(),mail->'snapshot'
      from jsonb_array_elements(p_mail) mail;
  return 'saved';
end $$;
revoke all on function public.write_proposal_question(uuid,integer,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.write_proposal_question(uuid,integer,integer,jsonb,jsonb) to service_role;

create function public.claim_proposal_question_mail(p_workspace uuid, p_proposal uuid)
returns setof public.proposal_question_mail language sql security invoker set search_path = '' as $$
  update public.proposal_question_mail m
    set attempt=m.attempt+1, available_at=statement_timestamp()+interval '3 minutes'
    where m.id=(
      select id from public.proposal_question_mail
        where workspace_id=p_workspace and (p_proposal is null or proposal_id=p_proposal)
        and available_at <= statement_timestamp()
        order by available_at, id limit 1 for update skip locked
    ) returning m.*;
$$;
revoke all on function public.claim_proposal_question_mail(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_proposal_question_mail(uuid,uuid) to service_role;
