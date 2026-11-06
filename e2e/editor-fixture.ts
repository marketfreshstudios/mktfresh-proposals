import { publicResult } from "../src/lib/service";
import { proposalAction } from "../src/lib/proposal-actions";
import type { Page } from "@playwright/test";
import { setup, staff, clientActor } from "../tests/helpers";
import { authoringPreview } from "../src/lib/authoring-preview";
import { pdfPreview, type PdfPreview } from "../src/lib/pdf-preview";
import { previewResult } from "../src/lib/preview";
import type { Block, Proposal, Quote } from "../src/lib/model";
export async function editorFixture(
  page: Page,
  long = false,
  options: {
    content?: Block[];
    quote?: Quote | ((base: Quote) => Quote);
    beforeSave?: (input: any) => Promise<void>;
    onReview?: (result: Proposal) => Promise<void>;
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
      ...(options.quote
        ? {
            quote:
              typeof options.quote === "function"
                ? options.quote(f.draft.quote)
                : options.quote,
          }
        : {}),
    },
    staff,
  );
  const renders: PdfPreview[] = [];
  const calls: any[] = [];
  const patches: any[] = [];
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
        if (req.method() === "PATCH") {
          const input = req.postDataJSON();
          patches.push(input);
          await options.beforeSave?.(input);
          active = await f.service.edit(active.id, input, staff);
        }
        if (parts[2] === "send") {
          const input = req.postDataJSON();
          active = await f.service.send(
            active.id,
            staff,
            input.confirm_ai_review,
            input.sender_user_id,
            { expected_revision: input.revision },
          );
        }
        if (parts[2] === "actions") {
          const input = req.postDataJSON();
          active = await proposalAction(
            f.repo,
            active.id,
            input.revision,
            input.action,
            staff,
            "",
            new Date(),
            f.service,
          );
        }
        if (parts[2] === "review") {
          active = await f.service.reviewSections(
            active.id,
            req.postDataJSON(),
            staff,
          );
          await options.onReview?.(active);
        }
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
      } else if (parts[0] === "templates" && req.method() === "POST") {
        value = req.postDataJSON();
        await f.repo.put("templates", value as any);
      } else if (parts[0] === "clients" && req.method() === "POST") {
        value = await f.service.updateClient(req.postDataJSON(), staff);
        active = await f.service.forRead((await f.repo.get(active.id))!);
      } else if (parts[0] === "public") {
        value = publicResult(await f.service.byToken(parts[1]));
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
      await route.fulfill({
        status: (e as any).status ?? 400,
        json: { error: String(e) },
      });
    }
  });
  return {
    ...f,
    content,
    active: () => active,
    renders,
    calls,
    patches,
    sendRemote: async () => {
      active = await f.service.send(active.id, staff);
      return active;
    },
    signRemote: async (input: unknown) => {
      active = await f.service.sign(active.id, input, "client", clientActor, {
        token: active.token!,
        password: "",
      });
      return active;
    },
    editRemote: async (input: Partial<import("../src/lib/model").Proposal>) => {
      active = await f.service.edit(
        active.id,
        { ...input, revision: active.revision },
        staff,
      );
      return active;
    },
  };
}
