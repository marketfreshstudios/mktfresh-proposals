import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("the account migration leaves settings and signature writes accessible only to the service", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.workspaces (id uuid primary key);
      create table public.staff_users (
        user_id uuid primary key, workspace_id uuid, display_name text, status text
      );
      create table public.workspace_settings (workspace_id uuid primary key, data jsonb);
      grant select, update on public.staff_users, public.workspace_settings to service_role;
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261110023405_staff_account_settings.sql",
        "utf8",
      ),
    );
    const workspace = "00000000-0000-4000-8000-000000000001";
    const signatory = "00000000-0000-4000-8000-000000000002";
    const colleague = "00000000-0000-4000-8000-000000000003";
    await db.query("insert into public.workspaces values ($1)", [workspace]);
    await db.query(
      "insert into public.staff_users values ($1,$3,'A Person','active'), ($2,$3,'B Person','active')",
      [signatory, colleague, workspace],
    );
    const settings = {
      company_signatory: {
        user_id: signatory,
        image: "before",
        name: "A Person",
        title: "Partner",
      },
      timezone: "UTC",
    };
    await db.query(
      "insert into public.workspace_settings values ($1,$2::jsonb)",
      [workspace, JSON.stringify(settings)],
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select * from public.staff_accounts"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query(
          "select public.save_staff_account($1,$2,null,'{}',null,null)",
          [workspace, signatory],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("select public.save_account_signature($1,$2,'{}','image')", [
          workspace,
          signatory,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await db.exec("set role service_role");
    const record = JSON.stringify({ id: signatory, theme: "dark" });
    const write = () =>
      db.query(
        "select public.save_staff_account($1,$2,null,$3,'A Person','A Newname') as saved",
        [workspace, signatory, record],
      );
    expect((await write()).rows).toEqual([{ saved: true }]);
    expect((await write()).rows).toEqual([{ saved: false }]);
    const update = (id: string) =>
      db.query(
        "select public.save_account_signature($1,$2,$3,'after') as saved",
        [workspace, id, JSON.stringify(settings.company_signatory)],
      );
    expect((await update(colleague)).rows).toEqual([{ saved: false }]);
    expect((await update(signatory)).rows).toEqual([{ saved: true }]);
    expect((await update(signatory)).rows).toEqual([{ saved: false }]);
    expect(
      (await db.query("select data from public.workspace_settings")).rows,
    ).toEqual([
      {
        data: {
          ...settings,
          company_signatory: { ...settings.company_signatory, image: "after" },
        },
      },
    ]);
  } finally {
    await db.close();
  }
});
