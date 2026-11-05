-- Reassignment updates only internal ownership, eligible live correspondence,
-- append-only audit and its staff notification. Frozen versions stay identical.
create function public.reassign_proposals(target_workspace uuid, actor_id uuid, documents jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare member public.staff_users; target public.staff_users; document jsonb; previous jsonb; audit jsonb; owner_id text;
begin
 perform 1 from public.workspaces where id=target_workspace for update;
 select * into member from public.staff_users where workspace_id=target_workspace and user_id=actor_id and status='active' and not password_change_required;
 if not found then raise exception 'Staff access required' using errcode='42501'; end if;
 if jsonb_array_length(documents) < 1 then raise exception 'Choose at least one proposal'; end if;
 if member.role <> 'owner' and jsonb_array_length(documents)>1 then raise exception 'Only a super admin can bulk reassign proposals' using errcode='42501'; end if;
 for document in select value from jsonb_array_elements(documents) loop
  select state into previous from public.proposals where workspace_id=target_workspace and id=(document->>'id')::uuid for update;
  if not found then raise exception 'Proposal not found' using errcode='P0002'; end if;
  owner_id=coalesce(previous->'owner'->>'user_id',previous->'sender'->>'user_id',case when previous->>'created_by' like 'staff:%' then substr(previous->>'created_by',7) end);
  if member.role <> 'owner' and owner_id is distinct from actor_id::text then raise exception 'You can only reassign proposals you own' using errcode='42501'; end if;
  select * into target from public.staff_users where workspace_id=target_workspace and user_id=(document->'owner'->>'user_id')::uuid and status='active';
  if not found then raise exception 'Choose an active staff member in this workspace' using errcode='23514'; end if;
  if (document->>'workspace_id')::uuid is distinct from target_workspace then raise exception 'Workspace mismatch' using errcode='42501'; end if;
  if (document - array['owner','sender','notification_emails','events','jobs','revision','updated_at']) is distinct from (previous - array['owner','sender','notification_emails','events','jobs','revision','updated_at']) then raise exception 'Reassignment cannot change proposal content or evidence' using errcode='23514'; end if;
  if not(previous->>'status' in ('sent','viewed') and coalesce(jsonb_array_length(previous->'signers'),0)=0 and coalesce(previous->>'archived_at','')='' and not exists(select 1 from jsonb_array_elements(previous->'versions') v where (v->>'frozen')::boolean)) and document->'sender' is distinct from previous->'sender' then raise exception 'The historical sender is immutable' using errcode='23514'; end if;
  audit=document->'events'->-1;
  if audit->>'type'<>'reassigned' or audit->>'actor'<>'staff:'||actor_id then raise exception 'Reassignment audit required'; end if;
  perform public.save_proposal(document,(document->>'revision')::integer-1);
  insert into public.workspace_events(id,workspace_id,data) values((audit->>'id')::uuid,target_workspace,jsonb_set(audit,'{metadata}',(audit->'metadata')||jsonb_build_object('proposal_id',document->>'id','title',document->>'title')));
 end loop;
end $$;
revoke all on function public.reassign_proposals(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reassign_proposals(uuid,uuid,jsonb) to service_role;

