import type { Proposal } from "./model";
import { check } from "./model";
import type { Repository } from "./repository";
import type { Storage } from "./storage";
import type { WorkspaceSettings } from "./workspace";
import { previewProposal } from "./preview";
import { canonical, sha256 } from "./content";
import { readFont, validateStyles } from "./studio";
import { styleFonts } from "./proposal-styles";
import type { PrintLayout } from "./document-print";
export type PdfPreview = {
  pdf_base64: string;
  fingerprint: string;
  revision: number;
  layout: PrintLayout;
};
// Short-lived process memory only. No proposal/files/jobs/events or sealed evidence
// are written. Single-flight avoids duplicate Chromium launches for preview/layout.
const cache = new Map<string, { until: number; value: Promise<PdfPreview> }>();
let renderTail: Promise<void> = Promise.resolve();
export async function pdfPreview(
  repo: Repository,
  storage: Storage,
  proposal: Proposal,
  settings: WorkspaceSettings,
): Promise<PdfPreview> {
  const p = previewProposal(proposal, settings),
    v = p.versions.at(-1)!;
  const renderSettings = p.workspace_settings!;
  check(p.source === "native", "PDF preview is available for native proposals");
  if (proposal.status === "draft")
    await validateStyles(
      repo,
      settings,
      p.template_style_overrides,
      p.style_overrides,
    );
  const fingerprint = sha256(
    canonical({ version: v, settings: renderSettings, currency: p.currency }),
  );
  const key = `${repo.workspaceId}:${p.id}:${fingerprint}`,
    now = Date.now();
  for (const [id, entry] of cache) if (entry.until < now) cache.delete(id);
  const existing = cache.get(key);
  if (existing)
    return { ...(await existing.value), revision: proposal.revision };
  const value = renderTail.then(async () => {
    const choices = [
      ...Object.values(renderSettings.proposal_fonts ?? {}),
      ...styleFonts(v.resolved_styles),
    ];
    const fonts = await Promise.all(
      [
        ...new Map(
          choices.filter((f) => typeof f !== "string").map((f) => [f.id, f]),
        ).values(),
      ].map(async (f) => ({
        ...f,
        data: Buffer.from(
          await readFont(storage, f, repo.workspaceId),
        ).toString("base64"),
      })),
    );
    let logo: string | undefined;
    if (renderSettings.logo) {
      check(
        renderSettings.logo.startsWith(repo.workspaceId + "/"),
        "Logo unavailable",
        404,
      );
      logo =
        "data:image/png;base64," +
        Buffer.from(await storage.get(renderSettings.logo)).toString("base64");
    }
    // Renderer loading is confined to this explicit preview operation.
    const { sealedPdf } = await import("./pdf");
    const result = await sealedPdf(
      v,
      [],
      [],
      p.currency,
      {
        settings: renderSettings,
        fonts,
        logo,
        document: { id: p.id, title: p.title },
      },
      { preview: true },
    );
    return {
      pdf_base64: result.pdf.toString("base64"),
      fingerprint,
      revision: proposal.revision,
      layout: result.layout,
    };
  });
  // Limit preview Chromium launches per process; a failed preview must not
  // poison the queue or consume memory needed by ordinary API requests.
  renderTail = value.then(
    () => {},
    () => {},
  );
  if (cache.size >= 8) cache.delete(cache.keys().next().value!);
  cache.set(key, { until: now + 60000, value });
  try {
    return await value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
