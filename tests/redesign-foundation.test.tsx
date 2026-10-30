import { flatQuote } from "../src/lib/quote-model";
import { mutate } from "../src/lib/repository";
import { variables } from "../src/lib/presentation";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { formatMoney, intervalSuffix } from "../src/lib/money";
import { legacyStaffRedirect, staffRoute } from "../src/lib/staff-routes";
import { statusDisplay } from "../src/lib/status-display";
import { money, versionHash } from "../src/lib/content";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { MoneyProvider } from "../src/components/money-context";
import { Status, Totals } from "../src/components/ui";
import { Skeleton } from "../src/components/foundation";
import { setup, staff, clientActor, signature } from "./helpers";
import { publicResult } from "../src/lib/service";
it("formats cents per amount with auto/always, including zero, negative amounts and other currencies", () => {
  expect(formatMoney(50000)).toBe("$500");
  expect(formatMoney(4950)).toBe("$49.50");
  expect(formatMoney(0)).toBe("$0");
  expect(
    ["one_time", "month", "year"].map((v) => intervalSuffix(v as any)),
  ).toEqual(["", "/mo", "/yr"]);
  expect(formatMoney(50000, "USD", "always")).toBe("$500.00");
  expect(formatMoney(-4950)).toBe("-$49.50");
  expect(formatMoney(50000, "EUR")).toBe("€500");
  expect(money(50000)).toBe("$500.00");
  const value = { one_time_total: 0, monthly_total: 17500, yearly_total: 5100 };
  expect(
    renderToStaticMarkup(
      <MoneyProvider mode="auto">
        <Totals value={value} />
      </MoneyProvider>,
    ),
  ).toContain("$175");
  expect(
    renderToStaticMarkup(
      <MoneyProvider mode="always">
        <Totals value={value} />
      </MoneyProvider>,
    ),
  ).toContain("$175.00");
  const legacy = renderToStaticMarkup(<Totals value={value} />);
  expect(legacy).toContain("$175.00");
  expect(legacy).toContain("/month");
});
it.each([
  [["dashboard"], "/"],
  [["proposals", "new"], "/proposals?new=1"],
  [["proposals", "id", "edit"], "/proposals/id"],
  [["proposals", "id", "send"], "/proposals/id?view=send"],
  [["proposals", "id", "countersign"], "/proposals/id?action=countersign"],
  [["proposals", "id", "audit"], "/proposals/id?view=evidence"],
  [["catalogue"], "/studio/catalog"],
  [["settings", "team"], "/studio/workspace?view=team"],
  [["settings", "ai"], "/studio/connections?view=assistants"],
  [["imports"], "/studio/connections?view=imports"],
  [["templates", "id", "edit"], "/studio/templates/id/edit"],
  [["library"], "/studio/templates?view=blocks"],
] as [string[], string][])(
  "redirects legacy address %s without changing data",
  (path, target) => expect(legacyStaffRedirect(path)).toBe(target),
);
it("maps canonical views onto existing actions while later feature phases remain deferred", () => {
  expect(staffRoute(["studio", "catalog"])).toEqual({
    section: "catalogue",
    id: undefined,
    action: undefined,
  });
  expect(
    staffRoute(["proposals", "id"], { action: "countersign" }).action,
  ).toBe("countersign");
  expect(staffRoute(["studio", "workspace"], { view: "team" })).toMatchObject({
    section: "settings",
    id: "team",
  });
  expect(legacyStaffRedirect(["studio", "activity"])).toBeNull();
});
it("uses display-only status words and accessible tags/skeletons", () => {
  expect(statusDisplay("signed_by_client")).toMatchObject({
    name: "Won",
    tone: "success",
  });
  expect(statusDisplay("completed").name).toBe("Won");
  expect(statusDisplay("declined").name).toBe("Lost");
  const html = renderToStaticMarkup(
    <Status status="signed_by_client" ai billingPending />,
  );
  for (const word of ["Won", "Needs countersign", "Billing to finish", "AI"])
    expect(html).toContain(word);
  expect(renderToStaticMarkup(<Skeleton />)).toContain('role="status"');
});
it("current money preferences parse while old sent/signed rendering, quote shape and content hashes stay unchanged", async () => {
  const { repo, service, draft, settings } = await setup();
  expect(
    WorkspaceSettingsSchema.parse({ ...settings, money: { cents: "always" } })
      .money?.cents,
  ).toBe("always");
  let sent = await service.send(draft.id, staff);
  // Explicit pre-redesign fixture: the old flat evidence, fixed cents and no new flags.
  sent = await mutate(repo, sent.id, (p) => {
    p.quote = flatQuote(p.quote);
    delete p.quote_model_version;
    const v = p.versions[0];
    v.quote = flatQuote(v.quote);
    delete v.quote_model_version;
    delete v.money_format_version;
    v.variables_resolved = variables(p, v.quote, false);
    v.content_hash = versionHash({
      content: v.content,
      quote: v.quote,
      variables_resolved: v.variables_resolved,
    });
  });
  const signed = await service.sign(
    sent.id,
    signature(sent.revision),
    "client",
    clientActor,
    { token: sent.token!, password: "" },
  );
  const before = JSON.stringify(signed),
    view = publicResult(signed),
    hash = signed.versions[0].content_hash;
  await repo.put("workspace_settings", {
    ...settings,
    money: { cents: "auto" },
    accent_colour: "#123456",
  });
  expect(publicResult((await repo.get(signed.id))!)).toEqual(view);
  expect(view.html).toContain("$2,750.00");
  expect(view.html).toContain("$25.00");
  const { content, quote, variables_resolved } = signed.versions[0];
  expect(versionHash({ content, quote, variables_resolved })).toBe(hash);
  expect(JSON.stringify(await repo.get(signed.id))).toBe(before);
  expect(signed.quote[0]).toHaveProperty("amount");
  expect(signed.quote[0]).not.toHaveProperty("sublines");
});
