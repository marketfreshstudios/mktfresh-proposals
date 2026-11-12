import { quoteSublines, cloneQuote } from "../src/lib/quote-model";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { setup, staff, signature, clientActor } from "./helpers";
import { aiTool, WRITE_TOOLS } from "../src/lib/ai-tools";
import { OAuthServer } from "../src/lib/oauth";
import { MemoryOAuthStore } from "../src/lib/oauth-store";
import { markdownBlocks } from "../src/lib/markdown";
import { readiness } from "../src/lib/quote";
import { type Item } from "../src/lib/model";
const scopes = ["proposals:read", "proposals:draft"];
it("requires PKCE/audience, consumes codes once, rotates refresh tokens and revokes reuse", async () => {
  const store = new MemoryOAuthStore(),
    oauth = new OAuthServer(store, "https://proposals.example.test", [
      "https://claude.ai/api/mcp/auth_callback",
    ]);
  const client = await oauth.register({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  const verifier = "a".repeat(43);
  const params = {
    client_id: client.client_id,
    redirect_uri: client.redirect_uris[0],
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    resource: oauth.resource,
    scope: scopes.join(" "),
    state: "caller-state",
  };
  await expect(
    oauth.authorize(
      { ...params, code_challenge_method: "plain" },
      { ...staff, workspace_id: "00000000-0000-4000-8000-000000000001" },
    ),
  ).rejects.toThrow("S256");
  const redirect = new URL(
    await oauth.authorize(params, {
      ...staff,
      workspace_id: "00000000-0000-4000-8000-000000000001",
    }),
  );
  expect(redirect.searchParams.get("state")).toBe("caller-state");
  const exchange = {
    ...params,
    grant_type: "authorization_code",
    code: redirect.searchParams.get("code")!,
    code_verifier: verifier,
  };
  await expect(
    oauth.exchange({ ...exchange, resource: "https://other.test/mcp" }),
  ).rejects.toThrow("audience");
  await expect(
    oauth.exchange({ ...exchange, code_verifier: "b".repeat(43) }),
  ).rejects.toThrow("PKCE");
  const tokens = await oauth.exchange(exchange);
  expect((await oauth.authenticate(tokens.access_token)).actor.actor).toBe(
    "ai:Claude",
  );
  await expect(oauth.exchange(exchange)).rejects.toThrow("code");
  const refresh = {
    grant_type: "refresh_token",
    client_id: client.client_id,
    refresh_token: tokens.refresh_token,
    resource: oauth.resource,
  };
  const next = await oauth.exchange(refresh);
  await expect(oauth.authenticate(tokens.access_token)).rejects.toThrow(
    "token",
  );
  await expect(oauth.exchange(refresh)).rejects.toThrow("reuse");
  await expect(oauth.authenticate(next.access_token)).rejects.toThrow(
    "revoked",
  );
  expect(JSON.stringify([...store.records.values()])).not.toContain(
    tokens.access_token,
  );
});
it("AI creates a review-required draft; explicit section review unlocks send and frozen proposals reject AI edits", async () => {
  const { repo, service, draft } = await setup();
  const ai = {
    actor: "ai:Claude",
    workspace_id: repo.workspaceId,
    ip: "",
    user_agent: "MCP",
  };
  const result = (await aiTool(
    repo,
    ai,
    "create_proposal_draft",
    {
      brief: "Discovery notes",
      template_id: draft.template_id,
      client_id: draft.client.id,
      title: "AI draft",
      content_markdown:
        "# Scope\n\nHello {{client.first_name}}.\n\n- Design\n- Build",
      items: cloneQuote(draft.quote),
    },
    scopes,
  )) as { id: string; revision: number };
  const created = (await repo.get(result.id))!;
  expect(created.ai_unreviewed).toBe(true);
  expect(created.events[0].actor).toBe("ai:Claude");
  expect(created.brief).toBe("Discovery notes");
  expect(
    await aiTool(repo, ai, "check_ready", { id: created.id }, scopes),
  ).toEqual(
    readiness(
      await service.forRead(created),
      await repo.entities<Item>("pricing_items"),
    ),
  );
  await expect(service.send(created.id, staff)).rejects.toThrow(
    "Confirm review",
  );
  let p = await service.edit(
    created.id,
    {
      revision: created.revision,
      title: "Reviewed proposal",
      content: created.content.map((b) =>
        b.ai_review
          ? { ...b, ai_review: { ...b.ai_review, reviewed: true } }
          : b,
      ),
    },
    staff,
  );
  expect(p.ai_unreviewed).toBe(false);
  p = await service.send(p.id, staff);
  await expect(
    aiTool(
      repo,
      ai,
      "set_quote_lines",
      { id: p.id, revision: p.revision, items: cloneQuote(p.quote) },
      scopes,
    ),
  ).rejects.toThrow("only modify drafts");
  await expect(service.send(p.id, ai)).rejects.toThrow("cannot send");
  await expect(
    service.sign(p.id, signature(p.revision), "company", ai),
  ).rejects.toThrow("cannot sign");
  await expect(service.decline(p.token!, "", ai)).rejects.toThrow(
    "cannot decline",
  );
  for (const forbidden of [
    "send",
    "resend",
    "sign",
    "countersign",
    "decline",
    "billing",
    "settings",
    "delete_proposal",
    "retry",
    "create_custom_family",
  ])
    await expect(aiTool(repo, ai, forbidden, {}, scopes)).rejects.toThrow(
      "forbidden",
    );
  await expect(
    aiTool(repo, { ...ai, workspace_id: "other" }, "list_catalog", {}, scopes),
  ).rejects.toThrow("workspace");
  await expect(
    aiTool(
      repo,
      ai,
      "create_client",
      {
        company: "Test",
        first_name: "A",
        last_name: "B",
        email: "a@example.test",
      },
      ["proposals:read"],
    ),
  ).rejects.toThrow("scope");
});
it("rejects unknown variables and unsupported Markdown rather than silently dropping scope", () => {
  expect(() => markdownBlocks("Hello {{secret.key}}", [])).toThrow(
    "Unknown variable: secret.key",
  );
  expect(() => markdownBlocks("<script>alert(1)</script>", [])).toThrow(
    "Unsupported Markdown",
  );
  expect(() =>
    markdownBlocks("![remote](https://example.test/img.png)", []),
  ).toThrow("Unsupported Markdown");
});

it("AI draft tools cannot set or change a proposal sender", async () => {
  const { repo, draft } = await setup();
  const actor = {
    ...staff,
    actor: "ai:Example assistant",
    workspace_id: repo.workspaceId,
  };
  await aiTool(
    repo,
    actor,
    "update_proposal_draft",
    {
      id: draft.id,
      revision: draft.revision,
      title: "Updated",
      sender_user_id: staff.actor.slice(6),
      sender: { email: "forged@example.test" },
    },
    ["proposals:read", "proposals:draft"],
  );
  expect((await repo.get(draft.id))!.sender).toBeUndefined();
});
it("the connector lists active billing categories for custom recurring items", async () => {
  const { repo } = await setup();
  const ai = { actor: "ai:test", workspace_id: repo.workspaceId };
  await repo.put("custom_families", {
    id: "00000000-0000-4000-8000-000000000091",
    name: "Custom care",
    stripe_product_id: "prod_care",
    active: true,
  });
  await repo.put("custom_families", {
    id: "00000000-0000-4000-8000-000000000092",
    name: "Retired",
    stripe_product_id: "prod_old",
    active: false,
  });
  expect(
    await aiTool(repo, ai as never, "list_billing_categories", {}, scopes),
  ).toEqual([
    { id: "00000000-0000-4000-8000-000000000091", name: "Custom care" },
  ]);
  const { toolDefinitions } = await import("../src/lib/ai-tools");
  const quote = toolDefinitions.find((t) => t.name === "set_quote_lines")!;
  expect(quote.description).toContain("custom_family_id");
  expect(quote.description).toContain("list_billing_categories");
});
