/** Local-only acceptance check; status credentials are never printed or committed. */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "../src/lib/repository";
import { SupabaseStorage } from "../src/lib/storage";
import { ProposalService } from "../src/lib/service";
import { ClientSchema } from "../src/lib/model";
import { Worker, MockMailer } from "../src/lib/jobs";
import { MockBillingProvider } from "../src/lib/billing";
import { seed, seedIds } from "../src/lib/seed";
import { staff as authorize } from "../src/lib/auth";
const config = JSON.parse(await readFile(".data/supabase-status.json", "utf8"));
assert.equal(
  new URL(config.API_URL).hostname,
  "127.0.0.1",
  "This test must use local Supabase",
);
process.env.SUPABASE_URL = config.API_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = config.SERVICE_ROLE_KEY;
process.env.SUPABASE_ANON_KEY = config.ANON_KEY;
process.env.APP_MODE = "supabase";
const db = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }),
  anon = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false },
  });
const repo = new SupabaseRepository(db),
  storage = new SupabaseStorage(db),
  service = new ProposalService(repo),
  worker = new Worker(repo, storage, new MockMailer(), {
    qbo: new MockBillingProvider("qbo"),
    stripe: new MockBillingProvider("stripe"),
  });
const suffix = randomUUID(),
  password = randomUUID() + "A1!";
const user = await db.auth.admin.createUser({
  email: `staff-${suffix}@example.test`,
  password,
  email_confirm: true,
});
if (user.error) throw user.error;
const member = await db
  .from("staff_users")
  .insert({ user_id: user.data.user!.id });
if (member.error) throw member.error;
const session = await anon.auth.signInWithPassword({
  email: user.data.user!.email!,
  password,
});
if (session.error) throw session.error;
const actor = await authorize(
  new Request("http://127.0.0.1/api/proposals", {
    headers: { Authorization: `Bearer ${session.data.session!.access_token}` },
  }),
);
await seed(repo, true);
const client = ClientSchema.parse({
  id: randomUUID(),
  company: "Supabase Acceptance " + suffix,
  first_name: "Jane",
  last_name: "Doe",
  email: `client-${suffix}@example.test`,
});
await repo.put("clients", client);
let p = await service.create(
  {
    client_id: client.id,
    template_id: seedIds.template,
    title: "Fresh Supabase signing test",
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  },
  actor,
);
p = await service.send(p.id, actor);
p = await service.view(p.token!, "", {
  actor: "client",
  ip: "127.0.0.1",
  user_agent: "Acceptance",
});
p = await service.sign(
  p.id,
  {
    revision: p.revision,
    name: "Jane Doe",
    email: client.email,
    title: "Owner",
    consent: true,
    kind: "typed",
    typed_name: "Jane Doe",
  },
  "client",
  { actor: "client", ip: "127.0.0.1", user_agent: "Acceptance" },
  { token: p.token!, password: "" },
);
await worker.drain(p.id);
p = (await repo.get(p.id))!;
assert(p.billing_links.every((l) => l.status === "succeeded"));
p = await service.sign(
  p.id,
  {
    revision: p.revision,
    name: "Jonathan",
    email: user.data.user!.email!,
    title: "Owner",
    consent: true,
    kind: "typed",
    typed_name: "Jonathan",
  },
  "company",
  actor,
);
await worker.drain(p.id);
p = (await repo.get(p.id))!;
assert.equal(p.status, "completed");
assert(p.jobs.every((j) => j.status === "done"));
const file = p.files.find((f) => f.kind === "sealed" && f.stage === "company")!;
assert((await worker.verify(p, file.id)).valid);
assert((await repo.list("Fresh signing")).some((x) => x.id === p.id));
const anonymous = createClient(config.API_URL, config.ANON_KEY, {
  auth: { persistSession: false },
});
const read = await anonymous.from("proposals").select("id");
assert(read.error || read.data.length === 0);
const forbidden = await anonymous.storage
  .from("proposal-files")
  .download(file.storage_path);
assert(forbidden.error);
const outsider = await db.auth.admin.createUser({
  email: `outsider-${suffix}@example.test`,
  password,
  email_confirm: true,
});
if (outsider.error) throw outsider.error;
const outsideSession = await anonymous.auth.signInWithPassword({
  email: outsider.data.user!.email!,
  password,
});
if (outsideSession.error) throw outsideSession.error;
assert.equal((await anonymous.from("proposals").select("id")).data?.length, 0);
await assert.rejects(
  () =>
    authorize(
      new Request("http://127.0.0.1/api/proposals", {
        headers: {
          Authorization: `Bearer ${outsideSession.data.session!.access_token}`,
        },
      }),
    ),
  /Staff access required/,
);
const mutation = await db
  .from("events")
  .update({ actor: "tampered" })
  .eq("proposal_id", p.id);
assert(mutation.error);
console.log(
  JSON.stringify(
    {
      migration: "applied",
      auth: "staff allowed; outsider denied",
      storage: "private; verified download through service",
      state: p.status,
      signatures: p.signers.length,
      sealed_files: p.files.filter((f) => f.kind === "sealed").length,
      full_text_search: "passed",
      append_only_audit: "passed",
      billing: "mocked success",
      jobs: "all done",
    },
    null,
    2,
  ),
);
