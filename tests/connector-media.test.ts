import { it, expect, vi } from "vitest";
import sharp from "sharp";
import { setup } from "./helpers";
import { aiTool, toolDefinitions } from "../src/lib/ai-tools";
import { markdownBlocks } from "../src/lib/markdown";
import { markdownImages } from "../src/lib/connector-images";
import { renderBlocks } from "../src/lib/presentation";
import { validateCoverImage } from "../src/lib/brand-palette";
import type { SavedBlock, Template, Block } from "../src/lib/model";
const scopes = ["proposals:read", "proposals:draft", "templates:edit"];
async function fixture() {
  const f = await setup(),
    actor = {
      actor: "ai:Claude",
      workspace_id: f.repo.workspaceId,
      on_behalf_of_user_id: "00000000-0000-4000-8000-000000000001",
      on_behalf_of_name: "Alex Morgan",
      ip: "",
      user_agent: "MCP",
    };
  const call = (name: string, input: unknown, grant = scopes) =>
    aiTool(f.repo, actor, name, input, grant, f.service) as Promise<any>;
  const bytes = await sharp({
    create: {
      width: 240,
      height: 120,
      channels: 4,
      background: { r: 19, g: 48, b: 58, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const upload = () =>
    call("upload_image", {
      filename: "client-logo.png",
      content_base64: bytes.toString("base64"),
      alt: "Client logo",
    });
  return { ...f, call, bytes, upload };
}
it("HTTPS/autolinks/mailto use editor marks in headings, paragraphs and lists; unsafe schemes and relative paths are refused", () => {
  const blocks = markdownBlocks(
    "# [Our **work**](https://example.test)\n\nVisit https://example.test/work. Or [email us](mailto:hello@example.test).\n\n- [Case study](https://example.test/case)",
    [],
  );
  const html = renderBlocks(blocks, [], {}, "USD");
  expect(blocks[0].text).toBe("Our work");
  expect(blocks[0].rich_heading).toBe(true);
  expect(html).toContain('href="https://example.test"');
  expect(html).toContain('href="https://example.test/work"');
  expect(html).toContain('href="mailto:hello@example.test"');
  expect(html).toContain("<strong>work</strong>");
  expect(html).not.toContain('work.">');
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://example.test",
    "/relative",
    "//example.test",
    "#anchor",
  ])
    for (const prefix of ["", "# ", "- "])
      expect(() => markdownBlocks(`${prefix}[Unsafe](<${href}>)`, [])).toThrow(
        /HTTPS or mailto/,
      );
  expect(() => markdownBlocks("http://example.test", [])).toThrow(
    /HTTPS or mailto/,
  );
});
it("upload_image uses templates:edit and Studio's exact embedded PNG/JPEG bytes, decode limits and EXIF behavior", async () => {
  const f = await fixture(),
    before = await f.repo.list(),
    args = {
      filename: "logo.png",
      content_base64: f.bytes.toString("base64"),
      alt: "Client",
    };
  await expect(
    f.call("upload_image", args, ["proposals:read", "proposals:draft"]),
  ).rejects.toMatchObject({ status: 403 });
  const result = await f.upload();
  expect(result).toEqual({
    image_ref: `data:image/png;base64,${f.bytes.toString("base64")}`,
  });
  expect(await validateCoverImage(result.image_ref)).toMatchObject({
    width: 240,
    height: 120,
  });
  for (const filename of ["logo.svg", "logo.webp", "logo.txt"])
    await expect(f.call("upload_image", { ...args, filename })).rejects.toThrow(
      /PNG or JPEG/,
    );
  for (const content_base64 of [
    "not base64",
    Buffer.from("<svg></svg>").toString("base64"),
    f.bytes.subarray(0, 16).toString("base64"),
  ])
    await expect(
      f.call("upload_image", { ...args, content_base64 }),
    ).rejects.toThrow();
  await expect(
    f.call("upload_image", {
      ...args,
      content_base64: Buffer.alloc(700000).toString("base64"),
    }),
  ).rejects.toThrow(/700 KB|maximum|Too big/i);
  const huge = await sharp({
    create: { width: 4097, height: 4097, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(
    f.call("upload_image", {
      ...args,
      content_base64: huge.toString("base64"),
    }),
  ).rejects.toThrow(/16 megapixels/);
  const jpeg = await sharp(f.bytes)
    .jpeg()
    .withExif({ IFD0: { Artist: "Neutral fixture" } })
    .toBuffer();
  const retained = await f.call("upload_image", {
    ...args,
    filename: "logo.jpeg",
    content_base64: jpeg.toString("base64"),
  });
  expect(retained.image_ref).toBe(
    `data:image/jpeg;base64,${jpeg.toString("base64")}`,
  );
  expect(
    (
      await sharp(
        Buffer.from(retained.image_ref.split(",")[1], "base64"),
      ).metadata()
    ).exif,
  ).toBeDefined();
  expect(await f.repo.list()).toEqual(before);
  expect(
    toolDefinitions.find((t) => t.name === "upload_image")!.description,
  ).toContain("embedded");
});
it("a group with logo, linked text and fields round-trips exactly and can resize/replace just its image", async () => {
  const f = await fixture(),
    { image_ref } = await f.upload();
  const created = await f.call("create_saved_block", {
    name: "Client case study",
    type: "group",
    content: `![Client logo](${image_ref}){width=120}\n\n**Results** for {{client.company}}. [Visit the website](https://example.test/case).`,
  });
  const row = () =>
    f.repo
      .entities<SavedBlock>("content_library")
      .then((rows) => rows.find((r) => r.id === created.saved_block_id)!);
  const first = await row();
  expect(first.blocks).toHaveLength(2);
  expect(first.blocks![0].src).toBe(image_ref);
  expect((first.blocks![0].width_percent! * 672) / 100).toBeCloseTo(120, 4);
  let view = await f.call("get_saved_block", { saved_block_id: first.id });
  expect(view.content).toContain("![Client logo]");
  expect(view.content).toContain("{width=120}");
  expect(view.content).toContain("https://example.test/case");
  await f.call("update_saved_block", {
    saved_block_id: first.id,
    revision: view.revision,
    content: view.content,
  });
  expect((await row()).blocks).toEqual(first.blocks);
  view = await f.call("get_saved_block", { saved_block_id: first.id });
  await f.call("update_saved_block", {
    saved_block_id: first.id,
    revision: view.revision,
    content: view.content
      .replace("{width=120}", "{width=240}")
      .replace("![Client logo]", "![Updated logo]"),
  });
  const after = await row();
  expect(after.blocks).toHaveLength(2);
  expect(after.blocks![0]).toMatchObject({
    id: first.blocks![0].id,
    alt: "Updated logo",
    src: image_ref,
  });
  expect((after.blocks![0].width_percent! * 672) / 100).toBeCloseTo(240, 4);
  expect(after.blocks![1]).toEqual(first.blocks![1]);
  const html = renderBlocks(
    after.blocks!,
    [],
    { "client.company": "Example Client" },
    "USD",
  );
  expect(html).toContain(`src="${image_ref}"`);
  expect(html).toContain('href="https://example.test/case"');
  await expect(
    f.call("create_saved_block", {
      name: "Wrong shape",
      type: "text",
      content: `![Logo](${image_ref})`,
    }),
  ).rejects.toThrow(/type group/);
});
it("unknown, cross-workspace and remote image references never fetch; image widths clamp to normal editor sizing", async () => {
  const f = await fixture(),
    fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Remote fetch forbidden"));
  try {
    for (const ref of [
      "image:unknown",
      `image:${crypto.randomUUID()}/client-logo.png`,
      "https://example.test/logo.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ])
      await expect(
        f.call("create_saved_block", {
          name: "Rejected",
          type: "group",
          content: `![Logo](${ref}){width=120}`,
        }),
      ).rejects.toThrow(/Unsupported Markdown image/);
    expect(fetch).not.toHaveBeenCalled();
    const { image_ref } = await f.upload(),
      images = await markdownImages(`![Logo](${image_ref})`);
    const parse = (size: string) =>
      markdownBlocks(`![Logo](${image_ref}){width=${size}}`, [], images)[0];
    expect(parse("99999").width_percent).toBe(100);
    expect((parse("1").width_percent! * 672) / 100).toBeCloseTo(32, 5);
    expect(() => parse("0")).toThrow(/positive/);
    expect(() =>
      markdownBlocks(`Text ![Logo](${image_ref})`, [], images),
    ).toThrow(/Unsupported Markdown/);
  } finally {
    fetch.mockRestore();
  }
});
it("template writes and proposal draft writes share links/images, preserve marker round trips and leave existing proposals unchanged", async () => {
  const f = await fixture(),
    { image_ref } = await f.upload(),
    old = await f.repo.list();
  const created = await f.call("create_template", {
    name: "Case study template",
    content: `# [Results](https://example.test)\n\n![Logo](${image_ref}){width=120}\n\n[Contact](mailto:hello@example.test)`,
  });
  const template = (await f.repo.entities<Template>("templates")).find(
    (t) => t.id === created.template_id,
  )!;
  expect(template.active).toBe(false);
  const view = await f.call("get_template", { template_id: template.id });
  await f.call("update_template", {
    template_id: template.id,
    revision: view.revision,
    content: view.content,
  });
  expect(
    (await f.repo.entities<Template>("templates")).find(
      (t) => t.id === template.id,
    )!.content,
  ).toEqual(template.content);
  expect(await f.repo.list()).toEqual(old);
  const seed = (await f.repo.entities<Template>("templates")).find(
    (t) => t.active,
  )!;
  const draft = await f.call("create_proposal_draft", {
    client_id: f.draft.client.id,
    template_id: seed.id,
    title: "Results",
    brief: "Case study",
    content_markdown: `# Results\n\n![Logo](${image_ref}){width=120}\n\n[Website](https://example.test)`,
  });
  expect(
    draft.content.some((b: Block) => b.type === "image" && b.src === image_ref),
  ).toBe(true);
  expect(JSON.stringify(draft.content)).toContain('"type":"link"');
  const updated = await f.call("update_proposal_draft", {
    id: draft.id,
    revision: draft.revision,
    content_markdown: `[Email](mailto:hello@example.test)\n\n![Logo](${image_ref}){width=100}`,
  });
  expect(JSON.stringify(updated.content)).toContain(
    "mailto:hello@example.test",
  );
});

it("large valid embedded images retain the prose budget and round-trip beyond the old text-only result cap", async () => {
  const { randomBytes } = await import("node:crypto");
  const f = await fixture(),
    bytes = await sharp(randomBytes(360000), {
      raw: { width: 400, height: 300, channels: 3 },
    })
      .png()
      .toBuffer();
  expect(bytes.length).toBeGreaterThan(100000);
  expect(bytes.length).toBeLessThan(700000);
  const { image_ref } = await f.call("upload_image", {
    filename: "photo.png",
    content_base64: bytes.toString("base64"),
    alt: "Photo",
  });
  const result = await f.call("create_saved_block", {
    name: "Embedded photo",
    type: "group",
    content: `![Photo](${image_ref}){width=120}\n\nA short description.`,
  });
  const view = await f.call("get_saved_block", {
    saved_block_id: result.saved_block_id,
  });
  expect(view.content.length).toBeGreaterThan(140000);
  const before = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.id === result.saved_block_id,
  )!;
  await f.call("update_saved_block", {
    saved_block_id: result.saved_block_id,
    revision: view.revision,
    content: view.content,
  });
  expect(
    (await f.repo.entities<SavedBlock>("content_library")).find(
      (r) => r.id === before.id,
    )!.blocks,
  ).toEqual(before.blocks);
  await expect(
    f.call("create_saved_block", {
      name: "Too much prose",
      type: "group",
      content: `![Photo](${image_ref})\n\n${"A".repeat(100001)}`,
    }),
  ).rejects.toThrow(/text exceeds 100,000/);
});
it("old image-only markers append new copy safely, while an omitted ordinary image marker removes it", async () => {
  const f = await fixture(),
    { image_ref } = await f.upload();
  const result = await f.call("create_saved_block", {
    name: "Legacy marker",
    type: "group",
    content: `![Logo](${image_ref}){width=120}\n\nOriginal copy.`,
  });
  let view = await f.call("get_saved_block", {
    saved_block_id: result.saved_block_id,
  });
  const source = (await f.repo.entities<SavedBlock>("content_library")).find(
      (r) => r.id === result.saved_block_id,
    )!,
    id = source.blocks![0].id!;
  const imageLine = view.content
    .split("\n")
    .find((s: string) => s.startsWith("!["));
  await f.call("update_saved_block", {
    saved_block_id: result.saved_block_id,
    revision: view.revision,
    content: view.content.replace(
      imageLine,
      "New copy after an old image marker.",
    ),
  });
  const updated = (await f.repo.entities<SavedBlock>("content_library")).find(
    (r) => r.id === source.id,
  )!;
  expect(updated.blocks).toHaveLength(3);
  expect(updated.blocks![0]).toEqual(source.blocks![0]);
  view = await f.call("get_saved_block", { saved_block_id: source.id });
  const withoutImage = view.content.replace(
    new RegExp(`<!-- yeswell:block:${id} -->\\n[^\\n]+\\n*`),
    "",
  );
  await f.call("update_saved_block", {
    saved_block_id: source.id,
    revision: view.revision,
    content: withoutImage,
  });
  expect(
    (await f.repo.entities<SavedBlock>("content_library"))
      .find((r) => r.id === source.id)!
      .blocks!.some((b) => b.type === "image"),
  ).toBe(false);
});

it("standalone Text and List saved blocks keep links through read/modify/write", async () => {
  const f = await fixture();
  for (const type of ["text", "list"]) {
    const created = await f.call("create_saved_block", {
      name: `Linked ${type}`,
      type,
      content: `${type === "list" ? "- " : ""}[Website](https://example.test) and [Email](mailto:hello@example.test)`,
    });
    let view = await f.call("get_saved_block", {
      saved_block_id: created.saved_block_id,
    });
    const original = (
      await f.repo.entities<SavedBlock>("content_library")
    ).find((r) => r.id === created.saved_block_id)!;
    await f.call("update_saved_block", {
      saved_block_id: original.id,
      revision: view.revision,
      content: view.content,
    });
    expect(
      (await f.repo.entities<SavedBlock>("content_library")).find(
        (r) => r.id === original.id,
      )!.block,
    ).toEqual(original.block);
    view = await f.call("get_saved_block", { saved_block_id: original.id });
    await f.call("update_saved_block", {
      saved_block_id: original.id,
      revision: view.revision,
      content: view.content.replace(
        "https://example.test",
        "https://updated.example.test",
      ),
    });
    const row = (await f.repo.entities<SavedBlock>("content_library")).find(
      (r) => r.id === original.id,
    )!;
    const html = renderBlocks([row.block], [], {}, "USD");
    expect(html).toContain('href="https://updated.example.test"');
    expect(html).toContain('href="mailto:hello@example.test"');
  }
});
