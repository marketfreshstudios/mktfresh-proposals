import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  earlyAccessBody,
  earlyAccessFields,
  receiveEarlyAccess,
} from "../src/lib/early-access";

const KEY = "k".repeat(32);
beforeEach(() => vi.stubEnv("EARLY_ACCESS_WEBHOOK_KEY", KEY));
afterEach(() => vi.unstubAllEnvs());

it("reads both Elementor webhook shapes", () => {
  expect(
    earlyAccessFields(
      new URLSearchParams(
        "Name=Dana%20Ruiz&Email=Dana%40Harbor.test&form_name=Early+access",
      ),
    ),
  ).toEqual({ email: "dana@harbor.test", name: "Dana Ruiz" });
  expect(
    earlyAccessFields(
      new URLSearchParams(
        "fields[name][id]=name&fields[name][value]=Dana&fields[email][id]=email&fields[email][value]=dana@harbor.test&fields[email][raw_value]=dana@harbor.test&form[name]=Early",
      ),
    ),
  ).toEqual({ email: "dana@harbor.test", name: "Dana" });
  expect(
    earlyAccessFields(
      earlyAccessBody(
        JSON.stringify({ fields: { email: { value: "a@b.test" } } }),
      ),
    ),
  ).toEqual({ email: "a@b.test", name: "" });
  expect(
    earlyAccessFields(new URLSearchParams("Name=Dana&Email=not-an-email")),
  ).toBeNull();
  expect(() => earlyAccessBody("{bad")).toThrow("Unreadable");
});

it("adds the signup to the list only with the shared key", async () => {
  const add = vi.fn(async () => {});
  const form = new URLSearchParams("Name=Dana Lee Ruiz&Email=dana@harbor.test");
  await expect(receiveEarlyAccess("wrong", form, { add })).rejects.toThrow(
    "Not found",
  );
  await expect(receiveEarlyAccess("", form, { add })).rejects.toThrow(
    "Not found",
  );
  vi.stubEnv("EARLY_ACCESS_WEBHOOK_KEY", "short");
  await expect(receiveEarlyAccess("short", form, { add })).rejects.toThrow(
    "Not found",
  );
  vi.stubEnv("EARLY_ACCESS_WEBHOOK_KEY", KEY);
  expect(add).not.toHaveBeenCalled();
  expect(await receiveEarlyAccess(KEY, form, { add })).toEqual({ ok: true });
  expect(add).toHaveBeenCalledWith({
    email: "dana@harbor.test",
    first_name: "Dana",
    last_name: "Lee Ruiz",
  });
  await expect(
    receiveEarlyAccess(KEY, new URLSearchParams("Name=Dana"), { add }),
  ).rejects.toThrow("email address is required");
});
