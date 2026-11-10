import { chooseItem } from "../src/lib/quote-model";
import { starterLogo } from "./starter-logo";
import { expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { setup } from "./helpers";
import { starterTemplates } from "../seed/starter-templates";
import { authoringPreview } from "../src/lib/authoring-preview";
import { pdfPreview } from "../src/lib/pdf-preview";
import { templateDefaultQuote } from "../src/lib/template-quote";
import type { Item } from "../src/lib/model";
it("all starters render their exact cover, legal fields and conditional 4.4 through the existing real PDF pipeline", async () => {
  const f = await setup();
  const dir = await mkdtemp(join(tmpdir(), "starter-pdfs-"));
  try {
    const catalog = await f.repo.entities<Item>("pricing_items");
    const settings = {
      ...f.settings,
      business_state: { name: "North Carolina" as const, other: "" },
      logo: `${f.repo.workspaceId}/logo.png`,
    };
    const logo = await starterLogo();
    for (const t of starterTemplates(f.repo.workspaceId, {
      marketfresh: true,
      catalog,
    })) {
      const p = authoringPreview(
        { ...t, quote: templateDefaultQuote(t, catalog).quote },
        settings,
        f.repo.workspaceId,
      );
      const result = await pdfPreview(
        f.repo,
        { get: async () => logo, put: async () => {} },
        p,
        settings,
      );
      const bytes = Buffer.from(result.pdf_base64, "base64");
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount(), t.name).toBeGreaterThanOrEqual(5);
      expect(pdf.getPageCount(), t.name).toBeLessThanOrEqual(8);
      const path = join(dir, `${t.starter_key}.pdf`);
      await writeFile(path, bytes);
      const content = execFileSync("pdftotext", ["-layout", path, "-"], {
        encoding: "utf8",
      });
      const pages = content.split("\f");
      // New layouts separate the editable label from its value in columns.
      const coverText = execFileSync(
        "pdftotext",
        ["-raw", "-f", "1", "-l", "1", path, "-"],
        { encoding: "utf8" },
      ).replace(/\s+/g, "");
      expect(coverText).toContain("PREPAREDFORClient,Clientcompany");
      expect(coverText).toContain(
        `PREPAREDBY${settings.owner.replace(/\s+/g, "")},ExampleStudio`,
      );
      expect(coverText).toContain("VALIDUNTILJanuary31,2026");
      expect(content).toContain("State of North Carolina");
      expect(content).toContain("Signatures");
      expect(content).not.toContain("4.4 Own It Over Time");
      if (t.starter_key === "website-design-build") {
        const alternative = p.quote.find((i) => i.oiot_build)!;
        const selected = await pdfPreview(
          f.repo,
          { get: async () => logo, put: async () => {} },
          {
            ...p,
            quote: chooseItem(p.quote, alternative.id, true).map((i) => ({
              ...i,
              default_selected: !!i.selected,
              ...(i.id === alternative.id
                ? {
                    oiot_purchase_price: 375000,
                    sublines: [
                      ...i.sublines,
                      {
                        id: crypto.randomUUID(),
                        label: "Kickoff",
                        oiot_kickoff: true as const,
                        amount: 150000,
                        qty: 1,
                        interval: "one_time" as const,
                        list_amount: null,
                        stripe_lookup_key: null,
                        qbo_item_ref: null,
                      },
                    ],
                  }
                : {}),
            })),
          },
          settings,
        );
        const selectedPath = join(dir, "website-with-payment-plan.pdf");
        await writeFile(
          selectedPath,
          Buffer.from(selected.pdf_base64, "base64"),
        );
        const terms = execFileSync("pdftotext", [selectedPath, "-"], {
          encoding: "utf8",
        }).replace(/\s+/g, " ");
        expect(terms).toContain("4.4 Own It Over Time");
        expect(terms).toContain("kickoff payment of $1,500");
        expect(terms).toContain("full purchase price is $3,750");
        expect(terms).toContain("at least fifteen (15) days’ advance notice.");
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
