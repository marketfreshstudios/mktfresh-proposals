import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  findWorkspace,
  type FindWorkspaceDeps,
} from "../src/lib/find-workspace";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://studio.example.test");
  vi.stubEnv("WORKSPACE_DOMAIN", "example.test");
  vi.stubEnv("INTEGRATION_ENCRYPTION_KEY", "k".repeat(44));
});
afterEach(() => vi.unstubAllEnvs());

function deps(over: Partial<FindWorkspaceDeps> = {}) {
  const sent: { message: any; key: string }[] = [];
  const d: FindWorkspaceDeps = {
    admit: async () => true,
    member: async (email) =>
      email === "dana@harbor.test"
        ? { first_name: "Dana", business: "Harbor Studio", slug: "harbor" }
        : null,
    send: async (message, key) => {
      sent.push({ message, key });
    },
    from: () => "Yeswell <notifications@example.test>",
    ...over,
  };
  return { d, sent };
}

it("emails the sign-in link for the member's own address", async () => {
  const { d, sent } = deps();
  expect(
    await findWorkspace({ email: " Dana@Harbor.test " }, "1.2.3.4", d),
  ).toEqual({ sent: true });
  expect(sent).toHaveLength(1);
  const { message, key } = sent[0];
  expect(message.to).toBe("dana@harbor.test");
  expect(message.subject).toBe("Sign in to Harbor Studio");
  expect(message.html).toContain("https://harbor.example.test/login");
  expect(message.text).toContain("harbor.example.test");
  expect(message.text).toContain("Hi Dana,");
  // The key doesn't carry the address itself.
  expect(key).not.toContain("dana");
});

it("answers the same for an email with no workspace, and sends nothing", async () => {
  const { d, sent } = deps();
  expect(await findWorkspace({ email: "nobody@x.test" }, "1.2.3.4", d)).toEqual(
    { sent: true },
  );
  expect(sent).toEqual([]);
});

it("is rate limited and needs an email sender", async () => {
  await expect(
    findWorkspace(
      { email: "dana@harbor.test" },
      "1.2.3.4",
      deps({ admit: async () => false }).d,
    ),
  ).rejects.toThrow("Too many requests");
  await expect(
    findWorkspace(
      { email: "dana@harbor.test" },
      "1.2.3.4",
      deps({ from: () => null }).d,
    ),
  ).rejects.toThrow("not set up");
  await expect(
    findWorkspace({ email: "not-an-email" }, "1.2.3.4", deps().d),
  ).rejects.toThrow();
  await expect(
    findWorkspace({ email: "a@b.test", extra: 1 }, "1.2.3.4", deps().d),
  ).rejects.toThrow();
});
