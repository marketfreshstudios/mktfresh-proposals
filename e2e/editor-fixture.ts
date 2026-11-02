import type { Page } from "@playwright/test";
import { setup, staff } from "../tests/helpers";
import { authoringPreview } from "../src/lib/authoring-preview";
import { pdfPreview, type PdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
import type { Block, Quote } from "../src/lib/model";
export async function editorFixture(
  page: Page,
  long = false,
  options: {
    content?: Block[];
    quote?: Quote;
    onLayout?: (input: any, data: PdfPreview) => Promise<void>;
  } = {},
) {
  const f = await setup();
  const content: Block[] = options.content ?? [
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "First section",
      level: 1,
    },
    {
      id: crypto.randomUUID(),
      type: "paragraph",
      ai_review: long ? { source: "assistant", reviewed: false } : undefined,
      text: long
        ? "Long paragraph with a clear and useful plan. ".repeat(340)
        : "A clear and useful plan.",
    },
    { id: crypto.randomUUID(), type: "page_break" },
    {
      id: crypto.randomUUID(),
      type: "heading",
      text: "Second section",
      level: 1,
    },
    { id: crypto.randomUUID(), type: "paragraph", text: "Next steps." },
    { id: crypto.randomUUID(), type: "pricing_table" },
    { id: crypto.randomUUID(), type: "signature_block", role: "client" },
  ];
  const template = (await f.repo.entities<any>("templates"))[0];
  template.content = structuredClone(content);
  await f.repo.put("templates", template);
  let active = await f.service.edit(
    f.draft.id,
    {
      revision: f.draft.revision,
      content,
      ...(options.quote ? { quote: options.quote } : {}),
    },
    staff,
  );
  const renders: PdfPreview[] = [];
  const calls: any[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      parts = new URL(req.url()).pathname.split("/").filter(Boolean).slice(1);
    try {
      let value: unknown = [];
      if (parts[0] === "auth")
        value = {
          user: staff,
          settings: f.settings,
          staff: f.members,
          app_url: "http://127.0.0.1:3100",
          signatory_version: "fixture",
        };
      else if (parts[0] === "proposals") {
        if (req.method() === "PATCH")
          active = await f.service.edit(active.id, req.postDataJSON(), staff);
        if (parts[2] === "review")
          active = await f.service.reviewSections(
            active.id,
            req.postDataJSON(),
            staff,
          );
        if (parts[2] === "preview-pdf") {
          calls.push(req.postDataJSON());
          value = await pdfPreview(
            f.repo,
            {
              get: async () => new Uint8Array(),
              put: async () => {
                throw new Error("No writes");
              },
            },
            { ...active, ...req.postDataJSON() },
            f.settings,
          );
          renders.push(value as PdfPreview);
          await options.onLayout?.(req.postDataJSON(), value as PdfPreview);
        } else if (parts[2] === "preview")
          value = previewResult(active, f.settings);
        else value = parts[1] ? active : { items: [active], total: 1 };
      } else if (parts[0] === "document-preview") {
        const p = authoringPreview(
          req.postDataJSON(),
          f.settings,
          f.repo.workspaceId,
        );
        value = await pdfPreview(
          f.repo,
          {
            get: async () => new Uint8Array(),
            put: async () => {
              throw new Error("No writes");
            },
          },
          p,
          f.settings,
        );
        renders.push(value as any);
      } else value = await f.repo.entities(parts[0] as any);
      await route.fulfill({ json: value });
    } catch (e) {
      if (page.isClosed() || req.failure()?.errorText.includes("ERR_ABORTED"))
        return;
      await route.fulfill({ status: 400, json: { error: String(e) } });
    }
  });
  return { ...f, content, active: () => active, renders, calls };
}
