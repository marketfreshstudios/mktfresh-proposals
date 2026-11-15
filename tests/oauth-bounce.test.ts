import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  OAUTH_CALLBACK_PATHS,
  bounceOAuthCallback,
  oauthCallbackAllowed,
  oauthOriginAllowed,
  oauthState,
  oauthStateSlug,
} from "../src/lib/oauth-bounce";
import { QBO_CALLBACK } from "../src/lib/providers/qbo-connection";
import { stripeConnectCallback } from "../src/lib/providers/stripe-connect";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://studio.example.test");
  vi.stubEnv("WORKSPACE_DOMAIN", "example.test");
});
afterEach(() => vi.unstubAllEnvs());

const registered = new URL("https://studio.example.test" + QBO_CALLBACK);

it("knows both registered callback paths", () => {
  expect(OAUTH_CALLBACK_PATHS).toEqual([QBO_CALLBACK, stripeConnectCallback]);
});

it("names the workspace address in the state, and nothing else", () => {
  const bare = oauthState();
  expect(bare).toMatch(/^[\w-]{43}$/);
  expect(oauthStateSlug(bare)).toBeNull();
  const named = oauthState("harbor");
  expect(named).toMatch(/^[\w-]{43}\.harbor$/);
  expect(oauthStateSlug(named)).toBe("harbor");
  // An unusable address isn't put in the state at all.
  expect(oauthState("app")).toMatch(/^[\w-]{43}$/);
  expect(oauthState("Not Valid")).toMatch(/^[\w-]{43}$/);
  // Malformed states are refused outright.
  for (const bad of [
    "",
    "short",
    `${bare}.harbor.extra`,
    `${bare}.app`,
    `${bare}.Harbor`,
  ])
    expect(oauthStateSlug(bad)).toBeUndefined();
});

it("allows a connection from the registered host or the state's own address", () => {
  expect(oauthOriginAllowed(registered, "https://studio.example.test")).toBe(
    true,
  );
  expect(
    oauthOriginAllowed(registered, "https://harbor.example.test", "harbor"),
  ).toBe(true);
  expect(oauthOriginAllowed(registered, "https://harbor.example.test")).toBe(
    false,
  );
  expect(
    oauthOriginAllowed(registered, "https://other.example.test", "harbor"),
  ).toBe(false);
  expect(oauthOriginAllowed(registered, "https://evil.test", "harbor")).toBe(
    false,
  );

  const state = oauthState("harbor");
  const at = (origin: string, path = QBO_CALLBACK) =>
    new URL(origin + path + "?state=" + state);
  expect(
    oauthCallbackAllowed(registered, at("https://studio.example.test"), state),
  ).toBe(true);
  expect(
    oauthCallbackAllowed(registered, at("https://harbor.example.test"), state),
  ).toBe(true);
  expect(
    oauthCallbackAllowed(registered, at("https://other.example.test"), state),
  ).toBe(false);
  expect(
    oauthCallbackAllowed(
      registered,
      at("https://harbor.example.test", "/api/x"),
      state,
    ),
  ).toBe(false);
  const bare = oauthState();
  expect(
    oauthCallbackAllowed(registered, at("https://harbor.example.test"), bare),
  ).toBe(false);
});

it("bounces a callback from the registered host to the workspace's own address", () => {
  const state = oauthState("harbor");
  const get = (url: string, host = new URL(url).host) =>
    new Request(url, { headers: { host } });
  const query = `?state=${state}&code=abc&realmId=123`;
  const moved = bounceOAuthCallback(
    get("https://studio.example.test" + QBO_CALLBACK + query),
  )!;
  expect(moved.status).toBe(303);
  expect(moved.headers.get("location")).toBe(
    "https://harbor.example.test" + QBO_CALLBACK + query,
  );
  expect(moved.headers.get("cache-control")).toBe("no-store");
  const stripe = bounceOAuthCallback(
    get(
      `https://studio.example.test${stripeConnectCallback}?state=${state}&code=x`,
    ),
  )!;
  expect(new URL(stripe.headers.get("location")!).host).toBe(
    "harbor.example.test",
  );

  // Already on that address, another path, a POST, or no address: untouched.
  expect(
    bounceOAuthCallback(
      get("https://harbor.example.test" + QBO_CALLBACK + query),
    ),
  ).toBeNull();
  expect(
    bounceOAuthCallback(get("https://studio.example.test/api/other" + query)),
  ).toBeNull();
  expect(
    bounceOAuthCallback(
      new Request("https://studio.example.test" + QBO_CALLBACK + query, {
        method: "POST",
      }),
    ),
  ).toBeNull();
  expect(
    bounceOAuthCallback(
      get(`https://studio.example.test${QBO_CALLBACK}?state=${oauthState()}`),
    ),
  ).toBeNull();
  // A state can't send anyone off the workspace domain.
  expect(
    bounceOAuthCallback(
      get(
        `https://studio.example.test${QBO_CALLBACK}?state=${"a".repeat(43)}.evil.test`,
      ),
    ),
  ).toBeNull();
  // Without workspace addresses there is nowhere to bounce to.
  vi.stubEnv("WORKSPACE_DOMAIN", "");
  expect(
    bounceOAuthCallback(
      get("https://studio.example.test" + QBO_CALLBACK + query),
    ),
  ).toBeNull();
});
