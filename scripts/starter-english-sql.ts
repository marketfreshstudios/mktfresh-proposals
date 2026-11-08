import type { Template } from "../src/lib/model";
/** Hash is PostgreSQL's own jsonb::text fingerprint, computed locally by PGlite. */
export function starterEnglishSql(
  workspace: string,
  row: Template,
  hash: string,
) {
  if (
    !/^[a-f0-9]{32}$/.test(hash) ||
    !/^[a-f0-9-]{36}$/.test(workspace) ||
    !/^[a-f0-9-]{36}$/.test(row.id)
  )
    throw new Error("Invalid starter guard");
  return `with changed as (update public.templates set data=jsonb_set(data,'{content}',replace(replace((data->'content')::text,'can be cancelled with 30 days'' notice','can be canceled with 30 days'' notice'),'Your logo, brand colours and any photos','Your logo, brand colors and any photos')::jsonb) where workspace_id='${workspace}'::uuid and id='${row.id}'::uuid and md5(data::text)='${hash}' returning id) select count(*) as updated from changed;`;
}
