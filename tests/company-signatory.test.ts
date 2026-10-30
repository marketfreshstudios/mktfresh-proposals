import { it, expect } from "vitest";
import {
  setup,
  staff,
  clientActor,
  signature,
  companyConsent,
  testSignatureImage,
} from "./helpers";
import {
  companySignature,
  signatoryVersion,
} from "../src/lib/company-signatory";
import { onBehalfText } from "../src/lib/workspace";
import { publicResult } from "../src/lib/service";
const delegate = {
  ...staff,
  actor: "staff:00000000-0000-4000-8000-000000000002",
  staff_name: "Franz",
  staff_email: "franz@example.test",
  staff_role: "member" as const,
  ip: "203.0.113.42",
};
it("requires explicit delegation and freezes the designated signature with the actual applier's evidence", async () => {
  const { repo, service, draft, settings } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
    token: p.token!,
    password: "",
  });
  // Configuration changes after draft creation must be used at counter-signing.
  settings.company_name = "MarketFresh Studios";
  settings.company_signatory!.name = "Jonathan Garces";
  settings.company_signatory!.authorized_user_ids.push(delegate.actor.slice(6));
  await repo.put("workspace_settings", settings);
  const text = onBehalfText("Jonathan Garces", "MarketFresh Studios");
  const input = companyConsent(p.revision, settings);
  for (const extra of [
    {},
    { authorization: true },
    { authorization: true, authorization_text: "I agree" },
    { authorization: false, authorization_text: text },
  ]) {
    await expect(
      service.sign(p.id, { ...input, ...extra }, "company", delegate),
    ).rejects.toThrow("exact authorization");
  }
  p = await service.sign(
    p.id,
    {
      ...input,
      authorization: true,
      authorization_text: text,
      name: "FORGED",
      image: "bad",
      email: "forged@example.test",
    },
    "company",
    delegate,
  );
  const signed = p.signers[1];
  expect(signed).toMatchObject({
    name: "Jonathan Garces",
    title: "Owner",
    company: "MarketFresh Studios",
    image: testSignatureImage,
    actor: delegate.actor,
    ip: delegate.ip,
    applied_by: {
      user_id: delegate.actor.slice(6),
      name: "Franz",
      email: delegate.staff_email,
    },
    authorization_text: text,
  });
  expect(signed.application_statement).toBe(
    "Company signature applied by Franz [franz@example.test] on behalf of Jonathan Garces",
  );
  expect(signed.signed_at).toBe(p.completed_at);
  const event = p.events.find((e) => e.type === "counter_signed")!;
  expect(event).toMatchObject({
    actor: delegate.actor,
    ip: delegate.ip,
    metadata: {
      authorization_text: text,
      application_statement: signed.application_statement,
      applied_by: signed.applied_by,
    },
  });
  expect(publicResult(p).signers[1]).toMatchObject({
    name: "Jonathan Garces",
    title: "Owner",
    company: "MarketFresh Studios",
    image: testSignatureImage,
  });
  expect(JSON.stringify(publicResult(p))).not.toContain("franz@example.test");
  settings.company_signatory!.name = "Next Signatory";
  settings.company_signatory!.image = null;
  await repo.put("workspace_settings", settings);
  expect((await repo.get(p.id))!.signers[1]).toEqual(signed);
  expect(
    JSON.stringify(p.jobs.find((j) => j.id.includes("company"))?.payload),
  ).toContain("Jonathan Garces");
});
it("refuses unauthorized staff, stale configuration, missing image and AI signing", async () => {
  const { service, draft, settings } = await setup();
  const input = companyConsent(draft.revision, settings);
  await expect(companySignature(input, delegate, settings)).rejects.toThrow(
    "not authorized",
  );
  await expect(
    companySignature({ ...input, signatory_version: "old" }, staff, settings),
  ).rejects.toThrow("changed");
  await expect(
    service.sign(draft.id, input, "company", {
      ...staff,
      actor: "ai:connector",
    }),
  ).rejects.toThrow("AI assistants cannot sign");
  await expect(
    companySignature(input, { ...staff, staff_email: undefined }, settings),
  ).rejects.toThrow("Authenticated staff email");
  settings.company_signatory!.image = null;
  await expect(
    companySignature(companyConsent(0, settings), staff, settings),
  ).rejects.toThrow("configure");
});
it("direct signatory uses stored identity without delegation, and drafts never expose reusable signature or allowlist", async () => {
  const { draft, settings } = await setup();
  const result = await companySignature(
    companyConsent(0, settings),
    staff,
    settings,
  );
  expect(result.signature.authorization_text).toBeUndefined();
  expect(result.signature.applied_by.user_id).toBe(
    settings.company_signatory!.user_id,
  );
  expect(draft.workspace_settings!.company_signatory!.image).toBeNull();
  expect(
    draft.workspace_settings!.company_signatory!.authorized_user_ids,
  ).toEqual([]);
});
