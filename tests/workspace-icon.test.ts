import { beforeEach, afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { setup, staff } from "./helpers";
import {
  uploadWorkspaceIcon,
  readWorkspaceIcon,
} from "../src/lib/workspace-icon";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
const state = vi.hoisted(() => ({ fixture: null as any, actor: null as any }));
vi.mock("../src/lib/auth", async (original) => ({
  ...(await original<typeof import("../src/lib/auth")>()),
  staff: async () => {
    if (!state.actor)
      throw new (await import("../src/lib/model")).AppError(
        401,
        "Staff authorization required",
      );
    return state.actor;
  },
}));
vi.mock("../src/lib/runtime", () => ({
  runtime: () => state.fixture,
  publicRuntime: async () => state.fixture,
  allRuntimes: vi.fn(),
}));
import { handle } from "../src/lib/http";
let files: Map<string, Uint8Array>;
beforeEach(async () => {
  vi.stubEnv("APP_MODE", "local");
  vi.stubEnv("APP_URL", "http://localhost");
  vi.stubEnv("DEV_STAFF_TOKEN", "local-icon-tests");
  vi.stubEnv("DATA_DIR", process.env.TMPDIR ?? "/tmp");
  files = new Map();
  state.fixture = {
    ...(await setup()),
    storage: {
      put: async (p: string, b: Uint8Array) => {
        files.set(p, b);
      },
      get: async (p: string) => {
        if (!files.has(p)) throw new Error("Missing file");
        return files.get(p)!;
      },
    },
  };
  state.actor = { ...staff, workspace_id: state.fixture.repo.workspaceId };
});
afterEach(() => vi.unstubAllEnvs());
async function png(width = 128, height = width, color = "#13303a") {
  return sharp({ create: { width, height, channels: 4, background: color } })
    .png()
    .toBuffer();
}
const data = (bytes: Buffer) =>
  "data:image/png;base64," + bytes.toString("base64");
async function call(path: string, input?: unknown) {
  return handle(
    new Request("http://localhost/api/" + path, {
      method: input === undefined ? "GET" : "POST",
      headers: {
        origin: "http://localhost",
        "content-type": "application/json",
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }),
    path.split("?")[0].split("/"),
  );
}
it("validates PNG type, bytes, square dimensions and size before storing anything", async () => {
  const upload = (image: string) =>
    uploadWorkspaceIcon(state.fixture.storage, state.fixture.repo.workspaceId, {
      image,
    });
  await expect(upload("data:image/svg+xml;base64,PHN2Zy8+")).rejects.toThrow(
    "PNG icon required",
  );
  await expect(upload(data(Buffer.from("not a PNG")))).rejects.toThrow(
    "Valid PNG",
  );
  await expect(upload(data(await png(127)))).rejects.toThrow("at least 128");
  await expect(upload(data(await png(128, 129)))).rejects.toThrow("square");
  await expect(upload(data(Buffer.alloc(750000)))).rejects.toThrow(
    "under 750 KB",
  );
  const truncated = (await png()).subarray(0, 32);
  await expect(upload(data(truncated))).rejects.toThrow("Valid PNG");
  expect(files.size).toBe(0);
});
it("stores and serves exact PNG favicon/Apple sizes, and retains original file metadata", async () => {
  const icon = await uploadWorkspaceIcon(
    state.fixture.storage,
    state.fixture.repo.workspaceId,
    { image: data(await png()), name: "Studio icon.png" },
  );
  expect(icon.name).toBe("Studio icon.png");
  expect(icon.size).toBe((await png()).length);
  for (const size of [16, 32, 128, 180]) {
    const meta = await sharp(
      await readWorkspaceIcon(
        state.fixture.storage,
        state.fixture.repo.workspaceId,
        icon,
        size,
      ),
    ).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([size, size, "png"]);
  }
  await expect(
    readWorkspaceIcon(state.fixture.storage, crypto.randomUUID(), icon, 32),
  ).rejects.toThrow("belong to this workspace");
  await expect(
    readWorkspaceIcon(
      state.fixture.storage,
      state.fixture.repo.workspaceId,
      icon,
      999,
    ),
  ).rejects.toThrow("Invalid icon size");
});
it("retains a high-resolution original for cover graphics without changing navigation variants", async () => {
  const bytes = await png(1024);
  const icon = await uploadWorkspaceIcon(
    state.fixture.storage,
    state.fixture.repo.workspaceId,
    { image: data(bytes) },
  );
  expect(icon).toMatchObject({ width: 1024, height: 1024 });
  expect(
    await readWorkspaceIcon(
      state.fixture.storage,
      state.fixture.repo.workspaceId,
      icon,
      "original",
    ),
  ).toEqual(bytes);
  expect(
    (
      await sharp(
        await readWorkspaceIcon(
          state.fixture.storage,
          state.fixture.repo.workspaceId,
          icon,
          128,
        ),
      ).metadata()
    ).width,
  ).toBe(128);
  await expect(
    readWorkspaceIcon(
      state.fixture.storage,
      crypto.randomUUID(),
      icon,
      "original",
    ),
  ).rejects.toThrow("belong to this workspace");
});
it("only a super admin can save palette colors; suggesting colors never changes the saved palette", async () => {
  const { settings, repo } = state.fixture;
  state.actor = { ...state.actor, staff_role: "member" };
  expect(
    (
      await call("workspace_settings", {
        ...settings,
        brand_palette: ["#2f5d50"],
      })
    ).status,
  ).toBe(403);
  expect(
    (await repo.entities("workspace_settings"))[0].brand_palette,
  ).toBeUndefined();
  state.actor = { ...state.actor, staff_role: "owner" };
  expect(
    (
      await call("workspace_settings", {
        ...settings,
        brand_palette: ["#2f5d50"],
      })
    ).status,
  ).toBe(201);
  const bytes = await png(128, 128, "#b5532e"),
    path = `${repo.workspaceId}/logo.png`;
  files.set(path, bytes);
  await repo.put("workspace_settings", {
    ...settings,
    logo: path,
    brand_palette: ["#2f5d50"],
  });
  const response = await call("workspace-palette");
  expect(response.status).toBe(200);
  expect((await response.json()).colors).toContain("#b5532e");
  expect((await repo.entities("workspace_settings"))[0].brand_palette).toEqual([
    "#2f5d50",
  ]);
});
it("only Super admins upload, replace or remove; members can read and save unrelated settings", async () => {
  const input = { image: data(await png()), name: "Icon.png" };
  state.actor.staff_role = "member";
  expect((await call("workspace-icon", input)).status).toBe(403);
  state.actor.staff_role = "owner";
  const response = await call("workspace-icon", input);
  expect(response.status).toBe(200);
  const { icon } = await response.json();
  const settings = { ...state.fixture.settings, logo_icon: icon };
  expect((await call("workspace_settings", settings)).status).toBe(201);
  const originalLogo = settings.logo;
  state.actor.staff_role = "member";
  expect((await call("workspace-icon?size=32")).status).toBe(200);
  expect(
    (await call("workspace_settings", { ...settings, logo_icon: null })).status,
  ).toBe(403);
  expect(
    (
      await call("workspace_settings", {
        ...settings,
        accent_colour: "#24505A",
      })
    ).status,
  ).toBe(201);
  state.actor.staff_role = "owner";
  const replaced = await (
    await call("workspace-icon", {
      image: data(await png(256, 256, "#c2602f")),
      name: "Replacement.png",
    })
  ).json();
  expect(replaced.icon.path).not.toBe(icon.path);
  expect(
    (
      await call("workspace_settings", {
        ...settings,
        logo_icon: replaced.icon,
      })
    ).status,
  ).toBe(201);
  expect(
    (await call("workspace_settings", { ...settings, logo_icon: null })).status,
  ).toBe(201);
  expect((await call("workspace-icon")).status).toBe(404);
  const saved = (await state.fixture.repo.entities("workspace_settings"))[0];
  expect(saved.logo).toBe(originalLogo);
  expect(saved.logo_icon).toBeNull();
  state.actor = null;
  expect((await call("workspace-icon")).status).toBe(401);
});
it("public icons use the current workspace, without altering a published proposal or its PDF branding", async () => {
  const f = state.fixture;
  await f.service.send(f.draft.id, staff, false, undefined, {
    delivery_method: "manual",
  });
  const p = await f.repo.get(f.draft.id);
  const frozen = structuredClone(p);
  const icon = await uploadWorkspaceIcon(f.storage, f.repo.workspaceId, {
    image: data(await png()),
    name: "Icon.png",
  });
  await f.repo.put("workspace_settings", { ...f.settings, logo_icon: icon });
  state.actor = null;
  expect((await call(`public/${p.token}/brand/icon?size=180`)).status).toBe(
    200,
  );
  expect(
    (await (await call(`public/${p.token}/brand`)).json()).logo_icon,
  ).toBeTruthy();
  expect(await f.repo.get(p.id)).toEqual(frozen);
  await f.repo.put("workspace_settings", f.settings);
  expect((await call(`public/${p.token}/brand/icon?size=32`)).status).toBe(404);
  expect(
    (await (await call(`public/${p.token}/brand`)).json()).logo_icon,
  ).toBeNull();
  expect(WorkspaceSettingsSchema.parse(f.settings).logo_icon).toBeUndefined();
});
