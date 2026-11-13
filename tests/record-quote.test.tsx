import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordQuote } from "../src/components/records";
import type { Quote } from "../src/lib/model";
import { setup } from "./helpers";

async function quote() {
  const { draft } = await setup();
  const base = draft.quote.find((i) => !i.choice_group_id)!;
  const copy = (name: string, selected: boolean, optional = true) => ({
    ...structuredClone(base),
    id: crypto.randomUUID(),
    name,
    optional,
    selected,
    choice_group_id: null,
    sublines: base.sublines.map((l) => ({ ...l, id: crypto.randomUUID() })),
  });
  return [
    copy("Website build", true, false),
    copy("Local visibility", false),
    copy("Care plan", false),
  ] as Quote;
}

it("shows what the client chose and tucks the rest into a closed section", async () => {
  const html = renderToStaticMarkup(
    <RecordQuote quote={await quote()} currency="USD" signed />,
  );
  const [shown, hidden] = html.split('<details class="record-quote-others">');
  expect(shown).toContain("Website build");
  expect(shown).not.toContain("Local visibility");
  expect(hidden).toContain("Options not chosen (2)");
  expect(hidden).toContain("Local visibility");
  expect(hidden).toContain("Care plan");
});

it("before signing it lists every line with how it works", async () => {
  const html = renderToStaticMarkup(
    <RecordQuote quote={await quote()} currency="USD" signed={false} />,
  );
  expect(html).not.toContain("record-quote-others");
  expect(html).toContain("Local visibility");
  expect(html).toContain("Optional | Not ticked");
});

it("has no section when everything was chosen", async () => {
  const html = renderToStaticMarkup(
    <RecordQuote quote={(await quote()).slice(0, 1)} currency="USD" signed />,
  );
  expect(html).not.toContain("record-quote-others");
});
