import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { setup, staff as actor, clientActor, signature } from "./helpers";
import { publicResult } from "../src/lib/service";
import { previewResult } from "../src/lib/preview";
import { versionHash } from "../src/lib/content";
import { mutate } from "../src/lib/repository";
import { staff } from "../src/lib/auth";
import { FlowTotals } from "../src/components/client-proposal";
import { SignatureForm } from "../src/components/signature";
afterEach(() => vi.unstubAllEnvs());
it("marks new sends and draft previews for v2 without changing legacy sent versions or frozen evidence", async () => {
  const { repo, service, draft, settings } = await setup();
  expect(previewResult(draft, settings).client_flow_version).toBe(2);
  expect((await repo.get(draft.id))!.versions).toEqual([]);
  const sent = await service.send(draft.id, actor);
  expect(publicResult(sent).client_flow_version).toBe(2);
  await mutate(repo, sent.id, (p) => {
    delete p.versions[0].client_flow_version;
  });
  const legacy = (await repo.get(sent.id))!,
    old = structuredClone(legacy.versions[0]),
    html = publicResult(legacy).html;
  const resent = await service.send(sent.id, actor);
  expect(resent.versions[0]).toEqual(old);
  expect(resent.versions[1].client_flow_version).toBe(2);
  expect(publicResult(legacy).html).toBe(html);
  const second = await setup();
  const secondSent = await second.service.send(second.draft.id, actor);
  await mutate(second.repo, secondSent.id, (p) => {
    delete p.versions[0].client_flow_version;
  });
  const oldSent = (await second.repo.get(secondSent.id))!;
  const signed = await second.service.sign(
    oldSent.id,
    signature(oldSent.revision),
    "client",
    clientActor,
    { token: oldSent.token!, password: "" },
  );
  const version = signed.versions[0];
  expect(version.client_flow_version).toBeUndefined();
  expect(publicResult(signed).html).toBe(publicResult(oldSent).html);
  expect(
    versionHash({
      content: version.content,
      quote: version.quote,
      variables_resolved: version.variables_resolved,
    }),
  ).toBe(version.content_hash);
  expect(publicResult(signed).contact).toEqual({
    name: signed.sender!.display_name,
    email: signed.sender!.email,
  });
});
it("requires a real staff session even when the removed preview flag is set", async () => {
  vi.stubEnv("DESIGN_PREVIEW_OPEN", "1");
  vi.stubEnv("SUPABASE_URL", "https://unused.example.test");
  vi.stubEnv("APP_MODE", "supabase");
  for (const method of ["GET", "HEAD", "POST"])
    await expect(
      staff(
        new Request("https://app.example.test/api/proposals", {
          method,
          headers: { "sec-fetch-site": "same-origin" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401 });
});
it("client totals always separate one-time/monthly and show yearly only when a yearly line exists", async () => {
  const { service, draft } = await setup();
  const p = publicResult(await service.send(draft.id, actor));
  const html = renderToStaticMarkup(<FlowTotals proposal={p} />);
  expect(html).toContain("One-time");
  expect(html).toContain("Monthly");
  expect(html).not.toContain("Yearly");
  p.money_cents = "always";
  expect(renderToStaticMarkup(<FlowTotals proposal={p} />)).toContain(
    "$2,750.00",
  );
  p.quote.push({
    ...p.quote[0],
    id: "year",
    interval: "year",
    amount: 12000,
    optional: true,
    selected: false,
  });
  p.totals.yearly_total = 0;
  const yearly = renderToStaticMarkup(<FlowTotals proposal={p} />);
  expect(yearly).toContain("Yearly");
  expect(yearly).toContain("/yr");
});
it("the sign step fixes recipient email and keeps signature, full consent and disabled reason in order", () => {
  const html = renderToStaticMarkup(
    <SignatureForm
      name="Jamie Client"
      email="jamie@example.test"
      consentText="Exact full consent."
      revision={2}
      onSign={async () => {}}
    />,
  );
  expect(html).toContain('readOnly=""');
  expect(html).toContain("jamie@example.test");
  expect(html.indexOf("Signing as")).toBeLessThan(
    html.indexOf("Your signature"),
  );
  expect(html.indexOf("Your signature")).toBeLessThan(
    html.indexOf("Exact full consent."),
  );
  expect(html.indexOf("Exact full consent.")).toBeLessThan(
    html.indexOf("Sign proposal"),
  );
  expect(html).toContain("Tick the agreement before signing.");
});

it("decline records the exact optional note and queues a notification to the chosen staff sender", async () => {
  const { service, draft, repo } = await setup();
  const p = await service.send(draft.id, actor);
  await expect(
    service.decline(p.token!, "", clientActor, "x".repeat(2001)),
  ).rejects.toThrow("2000");
  expect((await repo.get(p.id))!.status).toBe("sent");
  const result = await service.decline(
    p.token!,
    "",
    clientActor,
    "  Our timing changed.  ",
  );
  expect(result.events.at(-1)).toMatchObject({
    type: "declined",
    actor: "client",
    metadata: { note: "  Our timing changed.  " },
  });
  expect(
    result.jobs.some(
      (j) =>
        j.kind === "email" &&
        j.payload.subject === `Proposal declined: ${p.title}` &&
        j.payload.to === p.sender!.email,
    ),
  ).toBe(true);
  expect(result.versions).toEqual(p.versions);
});
