import { describe, it, expect } from "vitest";
import { setup, staff, clientActor, signature } from "./helpers";
import {
  canonical,
  hashPassword,
  passwordMatches,
  renderBlocks,
  resolve,
  totals,
  versionHash,
} from "../src/lib/content";
import { publicResult } from "../src/lib/service";
import { mutate } from "../src/lib/repository";
describe("proposal lifecycle", () => {
  it("sends, views, changes optional pricing, signs and countersigns immutable version", async () => {
    const { repo, service, draft } = await setup();
    let p = await service.send(draft.id, staff);
    expect(p.token).toHaveLength(43);
    p = await service.view(p.token!, "", clientActor);
    p = await service.toggle(
      p.token!,
      "",
      { revision: p.revision, item_id: p.quote[1].id, selected: false },
      clientActor,
    );
    expect(totals(p.quote)).toEqual({
      one_time_total: 275000,
      monthly_total: 0,
    });
    expect(publicResult(p).html).toContain("$0.00");
    p = await service.sign(p.id, signature(p.revision), "client", clientActor, {
      token: p.token!,
      password: "",
    });
    const frozen = canonical(p.versions);
    expect(p.status).toBe("signed_by_client");
    await expect(
      service.toggle(
        p.token!,
        "",
        { revision: p.revision, item_id: p.quote[1].id, selected: true },
        clientActor,
      ),
    ).rejects.toThrow("frozen");
    p = await service.sign(
      p.id,
      signature(p.revision, "staff@example.test"),
      "company",
      staff,
    );
    expect(p.status).toBe("completed");
    expect(canonical(p.versions)).toBe(frozen);
    expect(p.signers).toHaveLength(2);
    expect(p.jobs.filter((j) => j.kind === "billing")).toHaveLength(1);
    expect(
      (await repo.get(p.id))!.events.some((e) => e.type === "counter_signed"),
    ).toBe(true);
  });
  it("blocks required toggles, stale signatures, wrong email, false consent and out-of-order countersign", async () => {
    const { service, draft } = await setup();
    const p = await service.send(draft.id, staff);
    await expect(
      service.toggle(
        p.token!,
        "",
        { revision: p.revision, item_id: p.quote[0].id, selected: false },
        clientActor,
      ),
    ).rejects.toThrow("optional");
    await expect(
      service.sign(p.id, signature(0), "client", clientActor, {
        token: p.token!,
        password: "",
      }),
    ).rejects.toThrow("changed");
    await expect(
      service.sign(
        p.id,
        signature(p.revision, "wrong@example.test"),
        "client",
        clientActor,
        { token: p.token!, password: "" },
      ),
    ).rejects.toThrow("match");
    await expect(
      service.sign(
        p.id,
        { ...signature(p.revision), consent: false as true },
        "client",
        clientActor,
        { token: p.token!, password: "" },
      ),
    ).rejects.toThrow();
    await expect(
      service.sign(p.id, signature(p.revision), "company", staff),
    ).rejects.toThrow("order");
  });
  it("only one concurrent signature can succeed", async () => {
    const { service, draft } = await setup();
    const p = await service.send(draft.id, staff);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.sign(p.id, signature(p.revision), "client", clientActor, {
          token: p.token!,
          password: "",
        }),
      ),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("password checks every public operation; expired and declined links fail", async () => {
    const { repo, service, draft } = await setup();
    await mutate(
      repo,
      draft.id,
      (p) => (p.password_hash = hashPassword("correct-password")),
    );
    const p = await service.send(draft.id, staff);
    await expect(service.view(p.token!, "wrong", clientActor)).rejects.toThrow(
      "password",
    );
    await service.view(p.token!, "correct-password", clientActor);
    await service.decline(p.token!, "correct-password", clientActor);
    await expect(service.byToken(p.token!, "correct-password")).rejects.toThrow(
      "unavailable",
    );
  });
  it("blocks missing provider mappings and unresolved variables at send", async () => {
    const { repo, service, draft } = await setup();
    await mutate(repo, draft.id, (p) => (p.quote[0].qbo_item_id = null));
    await expect(service.send(draft.id, staff)).rejects.toThrow("mapping");
    await mutate(repo, draft.id, (p) => {
      p.quote[0].qbo_item_id = "item";
      p.content = [{ type: "paragraph", text: "{{missing.variable}}" }];
    });
    await expect(service.send(draft.id, staff)).rejects.toThrow("Unresolved");
  });
  it("resending rotates link and retains prior version", async () => {
    const { service, draft } = await setup();
    const p = await service.send(draft.id, staff),
      next = await service.send(draft.id, staff);
    expect(next.versions).toHaveLength(2);
    expect(next.token).not.toBe(p.token);
    await expect(service.byToken(p.token!)).rejects.toThrow("Not found");
  });
  it("schedules reminders once and expires only unsigned proposals", async () => {
    const { repo, service, draft } = await setup();
    const p = await service.send(draft.id, staff);
    service.clock = () => new Date(Date.now() + 4 * 86400000);
    await service.tick();
    await service.tick();
    expect(
      (await repo.get(p.id))!.jobs.filter((j) => j.id.includes("reminder")),
    ).toHaveLength(1);
    service.clock = () => new Date(Date.now() + 31 * 86400000);
    await service.tick();
    expect((await repo.get(p.id))!.status).toBe("expired");
  });
});
it("canonical hashing ignores object key order, password hashes use salts, HTML is escaped", () => {
  expect(canonical({ b: 2, a: 1 })).toBe(canonical({ a: 1, b: 2 }));
  const hash = hashPassword("long-password");
  expect(hash).not.toBe(hashPassword("long-password"));
  expect(passwordMatches("long-password", hash)).toBe(true);
  expect(passwordMatches("wrong", hash)).toBe(false);
  expect(resolve("{{name}}", { name: "Jane" })).toBe("Jane");
  expect(
    renderBlocks(
      [{ type: "paragraph", text: "<script>alert(1)</script>" }],
      [],
      {},
    ),
  ).not.toContain("<script>");
  expect(() =>
    renderBlocks([{ type: "image", src: "http://169.254.169.254/" }], [], {}),
  ).toThrow("embedded");
  expect(
    versionHash({ content: [], quote: [], variables_resolved: { a: "1" } }),
  ).not.toBe(
    versionHash({ content: [], quote: [], variables_resolved: { a: "2" } }),
  );
});
