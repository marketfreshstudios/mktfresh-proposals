import { it, expect } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import { mutate } from "../src/lib/repository";
it("background updates do not invalidate reviewed content, but optional changes do", async () => {
  const { repo, service, draft } = await setup();
  let p = await service.send(draft.id, staff);
  p = await service.view(p.token!, "", clientActor);
  const hash = p.versions.at(-1)!.content_hash;
  const revision = p.revision;
  await mutate(repo, p.id, (p) => {
    p.jobs[0].status = "done";
  });
  const signed = await service.sign(
    p.id,
    { ...signature(revision), reviewed_hash: hash },
    "client",
    clientActor,
    { token: p.token!, password: "" },
  );
  expect(signed.status).toBe("signed_by_client");
  const next = await setup();
  let q = await next.service.send(next.draft.id, staff);
  const old = q.versions.at(-1)!.content_hash;
  const optional = q.quote.find((l) => l.optional)!;
  q = await next.service.toggle(
    q.token!,
    "",
    {
      revision: q.revision,
      reviewed_hash: old,
      item_id: optional.id,
      selected: !optional.selected,
    },
    clientActor,
  );
  await expect(
    next.service.sign(
      q.id,
      { ...signature(q.revision), reviewed_hash: old },
      "client",
      clientActor,
      { token: q.token!, password: "" },
    ),
  ).rejects.toThrow("reload before signing");
});
