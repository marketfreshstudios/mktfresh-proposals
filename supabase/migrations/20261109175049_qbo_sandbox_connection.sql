-- Serialize token rotation, reconnect/disconnect and one-time OAuth state
-- consumption without holding a database transaction across network calls.
create function public.replace_provider_credential(
  target_workspace uuid, target_id uuid, expected_data jsonb, replacement_data jsonb
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if replacement_data is not null and
     replacement_data->>'id' is distinct from target_id::text then
    return false;
  end if;
  if expected_data is null then
    if replacement_data is null then
      return false;
    end if;
    insert into public.provider_credentials(id, workspace_id, data)
      values (target_id, target_workspace, replacement_data)
      on conflict (id) do nothing;
  elsif replacement_data is null then
    delete from public.provider_credentials
      where id = target_id and workspace_id = target_workspace and data = expected_data;
  else
    update public.provider_credentials set data = replacement_data
      where id = target_id and workspace_id = target_workspace and data = expected_data;
  end if;
  return found;
end;
$$;
revoke all on function public.replace_provider_credential(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.replace_provider_credential(uuid,uuid,jsonb,jsonb) to service_role;
