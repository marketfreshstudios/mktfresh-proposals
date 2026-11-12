import { expect, it } from "vitest";
import { assembleDraftContent } from "../src/lib/draft-layout";
import type { Block } from "../src/lib/model";

const h = (text: string) => ({ type: "heading", text, level: 1 }) as Block;
const p = (text: string) => ({ type: "paragraph", text }) as Block;
const shape = (content: Block[]) =>
  content
    .map((b) =>
      b.type === "heading"
        ? `H(${b.text})`
        : b.type === "page_break"
          ? "|"
          : b.type === "pricing_table"
            ? "PRICING"
            : b.type === "contract"
              ? "TERMS"
              : b.type === "signature_block"
                ? "SIG"
                : ".",
    )
    .join(" ");
const terms = { type: "contract", text: "Terms", clauses: [] } as Block;

it("an assistant-written draft gets pricing under Investment, Terms after it and signatures on their own page", () => {
  // The order a regenerated Easley's draft had: Terms and pricing tacked on at the end.
  const written = [
    h("Overview"),
    p("Hi."),
    h("Investment"),
    p("Own It Now is paid once."),
    h("Next steps"),
    p("Sign below."),
    h("Signatures"),
  ];
  expect(shape(assembleDraftContent(written, [terms]))).toBe(
    "H(Overview) . H(Investment) PRICING . | TERMS H(Next steps) . | H(Signatures) SIG SIG",
  );
});

it("a (pricing_table) marker places the table exactly, and a missing Signatures heading is added", () => {
  const written = [
    h("Your investment"),
    p("Intro"),
    p("(pricing_table)"),
    p("Note"),
    h("Next steps"),
  ];
  expect(shape(assembleDraftContent(written, [terms]))).toBe(
    "H(Your investment) . PRICING . | TERMS H(Next steps) | H(Signatures) SIG SIG",
  );
});

it("without an investment heading, pricing and Terms go before the signatures", () => {
  expect(shape(assembleDraftContent([h("Overview"), p("x")], [terms]))).toBe(
    "H(Overview) . PRICING | TERMS | H(Signatures) SIG SIG",
  );
});
