import { describe, expect, it } from "vitest";
import {
  emailPickerFields,
  emailButtonCaption,
  emailIsDefault,
} from "../src/lib/email-editor";
import {
  emailDefaults,
  emailFields,
  validateTemplate,
} from "../src/lib/email-template-content";
import { legacyStaffRedirect } from "../src/lib/staff-routes";
describe("Studio email editor presentation", () => {
  it("filters only the picker; the global validator and saved content remain compatible", () => {
    for (const [key, prefixes] of [
      ["team_invite", ["team.", "sender.", "workspace."]],
      ["staff_billing_failed", ["job.", "proposal."]],
      [
        "proposal_sent",
        ["client.", "proposal.", "quote.", "sender.", "workspace."],
      ],
    ] as const) {
      expect(Object.keys(emailPickerFields(key))).toEqual(
        Object.keys(emailFields).filter((path) =>
          prefixes.some((prefix) => path.startsWith(prefix)),
        ),
      );
    }
    const t = emailDefaults.find((t) => t.key === "team_invite")!;
    expect(() =>
      validateTemplate({
        subject: "{{client.company}}",
        body: t.body,
        button_label: t.button_label,
      }),
    ).not.toThrow();
  });
  it("uses the current renderer defaults, treating chips and text tokens as equivalent", () => {
    const t = structuredClone(emailDefaults[0]);
    expect(emailIsDefault(t)).toBe(true);
    t.subject += " edited";
    expect(emailIsDefault(t)).toBe(false);
    expect(emailButtonCaption("team_invite", true)).toContain(
      "set-password page",
    );
    expect(emailButtonCaption("staff_viewed", true)).toContain(
      "proposal record",
    );
    expect(emailButtonCaption("proposal_sent", false)).toContain(
      "secure proposal",
    );
  });
  it("keeps old email URLs working", () => {
    expect(legacyStaffRedirect(["emails", "proposal_sent"])).toBe(
      "/studio/emails/proposal_sent",
    );
  });
});
