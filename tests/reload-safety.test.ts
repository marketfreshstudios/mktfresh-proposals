import { expect, it } from "vitest";
import { prepareReload, type ReloadGuard } from "../src/lib/reload-safety";
it("drains another edit arriving after the first save, before allowing reload", async () => {
  let pending = true,
    writes = 0;
  const guard = {
    current: {
      hasPendingWork: () => pending,
      flush: async () => {
        writes++;
        pending = writes === 1;
        return true;
      },
    },
  };
  expect(await prepareReload(() => [guard])).toBe(true);
  expect(writes).toBe(2);
});
it("includes a newly mounted editor and refuses unsaved explicit edits", async () => {
  const guards: { current: ReloadGuard }[] = [];
  const second = { current: { blocked: true } };
  guards.push({
    current: {
      flush: async () => {
        guards.push(second);
        return true;
      },
    },
  });
  expect(await prepareReload(() => guards)).toBe(false);
});
it("never reloads on failed or thrown saves", async () => {
  for (const flush of [
    async () => false,
    async () => {
      throw new Error("offline");
    },
  ])
    expect(await prepareReload(() => [{ current: { flush } }])).toBe(false);
});
