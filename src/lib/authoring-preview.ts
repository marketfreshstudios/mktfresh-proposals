import type { Block, Proposal, Quote } from "./model";
import type { StyleOverrides } from "./proposal-styles";
import type { WorkspaceSettings } from "./workspace";
/** A staff-only template specimen; never stored, sent or used for billing. */
export function authoringPreview(
  input: {
    header_footer?: import("./page-bands").TemplateBands;
    cover?: import("./cover").Cover;
    id: string;
    content: Block[];
    quote: Quote;
    style_overrides?: StyleOverrides;
    pagination?: import("./page-plan").PagePlan;
  },
  settings: WorkspaceSettings,
  workspace: string,
): Proposal {
  const date = "2026-01-01T12:00:00.000Z";
  return {
    id: input.id,
    revision: 0,
    workspace_id: workspace,
    client: {
      id: input.id,
      first_name: "Client",
      last_name: "",
      title: "",
      company: "Client company",
      email: "client@example.test",
      phone: "",
      address: {},
      notes: "",
      stripe_customer_id: null,
      qbo_customer_id: null,
    },
    template_id: null,
    title: "Proposal title",
    status: "draft",
    token: null,
    password_hash: null,
    valid_until: null,
    currency: settings.currency ?? "USD",
    source: "native",
    proposify_id: null,
    created_by: "staff:preview",
    created_at: date,
    updated_at: date,
    sent_at: null,
    first_viewed_at: null,
    client_signed_at: null,
    completed_at: null,
    pagination: input.pagination,
    header_footer: input.header_footer
      ? { ...input.header_footer, overrides: {} }
      : undefined,
    cover: input.cover,
    content: input.content,
    quote: input.quote,
    style_overrides: input.style_overrides,
    versions: [],
    signers: [],
    events: [],
    files: [],
    jobs: [],
    billing_links: [],
    search_text: "",
  };
}
