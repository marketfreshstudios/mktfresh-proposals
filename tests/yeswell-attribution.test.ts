import { afterEach, it, expect, vi } from "vitest";
import { setup, staff } from "./helpers";
import { WorkspaceSettingsSchema } from "../src/lib/workspace";
import { publicResult } from "../src/lib/service";
import {
  prepareEmail,
  renderTemplate,
  definition,
} from "../src/lib/email-templates";
import { proposalLink } from "../src/lib/links";
afterEach(() => vi.unstubAllEnvs());
it("defaults attribution on and preserves workspace branding in public state and both email parts", async () => {
  vi.stubEnv("APP_URL", "https://proposals.example.test");
  const { service, draft, settings } = await setup();
  expect(WorkspaceSettingsSchema.parse(settings).show_powered_by).toBe(true);
  const p = await service.send(draft.id, staff);
  for (const enabled of [true, false]) {
    p.workspace_settings = { ...settings, show_powered_by: enabled };
    expect(publicResult(p).show_powered_by).toBe(enabled);
    expect(publicResult(p).company.name).toBe("Example Studio");
    const mail = renderTemplate(definition("proposal_sent"), p);
    expect(mail.html).toContain(settings.accent_colour);
    expect(mail.text).toContain(settings.company_name);
    expect(mail.html.includes("Powered by Yeswell")).toBe(enabled);
    expect(mail.text.includes("Powered by Yeswell")).toBe(enabled);
    expect(mail.html.match(/class="email-cta"/g)).toHaveLength(1);
    if (enabled)
      expect(mail.html).toContain('href="https://yeswell.co" rel="noopener"');
  }
  const staffMail = renderTemplate(definition("staff_signed"), p);
  expect(staffMail.html).toContain("Yeswell · Staff notification");
  expect(staffMail.html).not.toContain("Powered by Yeswell");
});
it("current workspace opt-out applies to already published links and newly prepared emails, without rewriting snapshots", async () => {
  vi.stubEnv("APP_URL", "https://app.example.test");
  const { repo, service, draft, settings } = await setup();
  const p = await service.send(draft.id, staff);
  const frozen = JSON.stringify(p.versions),
    link = proposalLink(p);
  await repo.put("workspace_settings", { ...settings, show_powered_by: false });
  const mail = await prepareEmail(
    repo,
    p,
    p.jobs.find((j) => j.kind === "email")!,
  );
  expect(mail.html).not.toContain("Powered by Yeswell");
  expect(publicResult(p, { showPoweredBy: false }).show_powered_by).toBe(false);
  expect(JSON.stringify(p.versions)).toBe(frozen);
  expect(proposalLink(p)).toBe(link);
});
