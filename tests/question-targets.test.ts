import { describe, expect, it } from "vitest";
import type { Block } from "../src/lib/model";
import { questionTargets } from "../src/lib/question-targets";

describe("question targets", () => {
  it("makes each visible Terms clause its own target", () => {
    const content = [
      { id: "h", type: "heading", level: 1, text: "Terms" },
      {
        id: "c",
        type: "contract",
        text: "Terms",
        clauses: [
          {
            id: "pay",
            heading: "Payment for {{client.company}}",
            body: "Due in 30 days.",
            show_when: null,
          },
        ],
      },
    ] as unknown as Block[];
    const { blocks } = questionTargets(content, [], {
      "client.company": "Acme",
    });
    expect(blocks.get("pay")).toEqual({
      block_id: "pay",
      section: "section:h",
      label: "Terms | Payment for Acme",
      excerpt: "Payment for Acme: Due in 30 days.",
      kind: "term",
    });
    expect(blocks.has("c")).toBe(false);
  });
});
