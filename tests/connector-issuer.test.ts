import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { oauthIssuer, oauthServer } from "../src/lib/oauth-runtime";

beforeEach(() => {
  vi.stubEnv("APP_MODE", "local");
  vi.stubEnv("DATA_DIR", "/tmp/yeswell-connector-issuer-test");
  vi.stubEnv("APP_URL", "https://marketfresh.example.test");
  vi.stubEnv("OAUTH_ISSUER", "https://marketfresh.example.test");
  vi.stubEnv("WORKSPACE_DOMAIN", "example.test");
});
afterEach(() => vi.unstubAllEnvs());
const at = (host: string, path = "/mcp") =>
  new Request(`https://${host}${path}`, { headers: { host } });

it("serves each workspace's connector from its own address", () => {
  expect(oauthIssuer(at("harbor.example.test"))).toBe(
    "https://harbor.example.test",
  );
  const harbor = oauthServer(at("harbor.example.test"));
  expect(harbor.resource).toBe("https://harbor.example.test/mcp");
  expect(harbor.metadata().authorization_endpoint).toBe(
    "https://harbor.example.test/oauth/authorize",
  );
  // MarketFresh keeps the issuer it already has.
  expect(oauthServer(at("marketfresh.example.test")).issuer).toBe(
    "https://marketfresh.example.test",
  );
  // The shared address is its own issuer; other hosts use OAUTH_ISSUER.
  expect(oauthIssuer(at("app.example.test"))).toBe("https://app.example.test");
  expect(oauthIssuer(at("proposals.other.test"))).toBe(
    "https://marketfresh.example.test",
  );
  expect(oauthIssuer()).toBe("https://marketfresh.example.test");
  // One server per issuer, sharing one token store.
  expect(oauthServer(at("harbor.example.test"))).toBe(harbor);
  expect(oauthServer(at("marketfresh.example.test")).store).toBe(harbor.store);
});

it("binds an authorization to the address it was asked on", async () => {
  const harbor = oauthServer(at("harbor.example.test"));
  const { client_id } = await harbor.register({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  const params = {
    client_id,
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: "a".repeat(43),
  };
  await expect(
    harbor.validateAuthorization({
      ...params,
      resource: "https://harbor.example.test/mcp",
    }),
  ).resolves.toBeTruthy();
  await expect(
    harbor.validateAuthorization({
      ...params,
      resource: "https://marketfresh.example.test/mcp",
    }),
  ).rejects.toThrow("Resource audience mismatch");
});
