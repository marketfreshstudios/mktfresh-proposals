-- Apply before deploying R25 question edits. The public API verifies the token
-- and password. This RPC locks the proposal before checking its live state.
create function public.edit_client_proposal_question(
  p_workspace uuid, p_proposal uuid, p_question uuid, p_revision integer,
  p_text text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  doc jsonb;
  thread jsonb;
  expires timestamptz;
begin
  select state into doc from public.proposals
    where workspace_id=p_workspace and id=p_proposal for update;
  if not found then return '{"result":"closed"}'; end if;
  expires := (case when doc->>'published_state' is not null then doc#>>'{published_state,valid_until}'
                   else doc->>'valid_until' end)::timestamptz;
  if doc->>'token' is null or doc->>'source' is distinct from 'native'
    or coalesce(doc->>'status','') not in ('sent','viewed')
    or doc->>'archived_at' is not null or jsonb_array_length(doc->'signers') > 0
    or (expires is not null and expires <= clock_timestamp()) then
    return '{"result":"closed"}';
  end if;
  if (doc->>'revision')::integer is distinct from p_revision then
    return '{"result":"stale"}';
  end if;
  select data into thread from public.proposal_questions
    where workspace_id=p_workspace and proposal_id=p_proposal and id=p_question for update;
  if not found or thread->>'deleted_at' is not null then
    return '{"result":"missing"}';
  end if;
  if coalesce(jsonb_array_length(thread->'replies'),0) > 0 then
    return '{"result":"replied"}';
  end if;
  if p_text is null then
    -- Keep only the identity and timestamp needed for the hourly send limit.
    thread := jsonb_build_object(
      'id',p_question,'proposal_id',p_proposal,'created_at',thread->'created_at',
      'status','resolved','deleted_at',clock_timestamp(),
      'revision',(thread->>'revision')::integer + 1
    );
  else
    thread := thread || jsonb_build_object(
      'question',p_text,'revision',(thread->>'revision')::integer + 1
    );
  end if;
  update public.proposal_questions set data=thread
    where workspace_id=p_workspace and proposal_id=p_proposal and id=p_question;
  return jsonb_build_object('result','saved','thread',case when p_text is not null then thread end);
end $$;
revoke all on function public.edit_client_proposal_question(uuid,uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.edit_client_proposal_question(uuid,uuid,uuid,integer,text) to service_role;
