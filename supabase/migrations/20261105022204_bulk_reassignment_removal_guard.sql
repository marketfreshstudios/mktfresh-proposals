-- Keep the membership operation/last-admin/session revocation unchanged; only
-- change its unfinished-work predicate to the same explicit-owner fallback.
do $$ declare definition text; updated text; begin
 definition=pg_get_functiondef('public.change_team_member(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 updated=replace(definition,
 $old$(state->'sender'->>'user_id'=target_id::text or (status='draft' and state->>'created_by'='staff:'||target_id))$old$,
 $new$(coalesce(state->'owner'->>'user_id',state->'sender'->>'user_id',case when state->>'created_by' like 'staff:%' then substr(state->>'created_by',7) end)=target_id::text) and coalesce(state->>'archived_at','')=''$new$);
 if updated=definition then raise exception 'Team removal guard changed; review before applying reassignment migration'; end if;
 execute updated;
end $$;
