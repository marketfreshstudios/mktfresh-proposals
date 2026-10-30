# AI proposal drafting connector

The MCP endpoint is `https://YOUR_APP_DOMAIN/mcp`. Deployment and real Claude/ChatGPT connection checks happen after the owner creates hosted resources. Local tests exercise the same OAuth, MCP and draft services. No OpenAI or Anthropic API key is needed.

## Connect Claude

Open Customize → Connectors → Add custom connector, enter the MCP URL, choose Sign in now and **Register automatically**, then sign in with your proposal workspace account and allow the displayed read/draft scopes. On a Team/Enterprise account, an owner first adds the connector under organization settings. The server allows Claude's exact callback `https://claude.ai/api/mcp/auth_callback`. Claude's published-identity option is not implemented; select automatic registration.

## Connect ChatGPT

Open the custom MCP/plugin setup available to your account, add the MCP URL, and connect through OAuth. The server publishes protected-resource and authorization-server discovery metadata and supports dynamic registration with PKCE S256. It returns the issuer parameter and allows `https://chatgpt.com/connector_platform_oauth_redirect`. If ChatGPT shows a connector-specific callback instead, copy that **exact URI** into the comma-separated `OAUTH_REDIRECT_URIS` setting before connecting. Never allow a wildcard or arbitrary callback host.

Set `OAUTH_ISSUER` to the canonical HTTPS app origin, without a trailing slash. Tokens are bound to its `/mcp` audience. Both authorization and token requests include that resource. Access tokens last one hour; refresh tokens rotate and expire after 30 days. Refresh reuse revokes the connection. Removed staff cannot keep using their connection. Settings → AI assistants shows scopes, last use and revocation.

## Tool examples

IDs below are UUIDs returned by the relevant list/create tools. Monetary amounts are integer cents supplied by the owner/playbook; the connector does not calculate prices.

| Tool | Example arguments |
|---|---|
| `search_clients` | `{"query":"Acme"}` |
| `get_client` | `{"id":"CLIENT_UUID"}` |
| `list_templates` | `{}` |
| `get_template` | `{"id":"TEMPLATE_UUID"}` |
| `list_catalog` | `{}` |
| `list_documents` | `{}` |
| `get_document` | `{"id":"DOCUMENT_UUID"}` |
| `search_proposals` | `{"query":"website redesign"}` — searches imported proposal text too |
| `get_proposal` | `{"id":"PROPOSAL_UUID"}` |
| `create_client` | `{"company":"Acme Plumbing","first_name":"Jane","last_name":"Doe","email":"jane@example.test"}` |
| `create_proposal_draft` | `{"brief":"Discovery notes…","template_id":"TEMPLATE_UUID","client_id":"CLIENT_UUID","title":"Website proposal","content_markdown":"# Scope\n\nPrepared for {{client.company}}.","items":[ITEM]}` |
| `update_proposal_draft` | `{"id":"PROPOSAL_UUID","revision":0,"title":"Reviewed scope","content_markdown":"# Scope\n\nUpdated discovery requirements."}` |
| `set_quote_lines` | `{"id":"PROPOSAL_UUID","revision":1,"items":[ITEM]}` |
| `check_ready` | `{"id":"PROPOSAL_UUID"}` — same blockers and warnings as sending |

A custom monthly item (all amounts are entered cents):

```json
{"id":"00000000-0000-4000-8000-000000000090","order":0,"name":"Monthly retainer","description":"Agreed scope","source":"custom","pricing_item_id":null,"custom_family_id":"FAMILY_UUID","sublines":[{"id":"00000000-0000-4000-8000-000000000091","amount":200000,"qty":1,"interval":"month","list_amount":null,"stripe_lookup_key":null,"qbo_item_ref":null}],"optional":false,"default_selected":true,"choice_group_id":null,"min_term_months":null,"schedule":null,"plan_terms":null}
```

Use a real family UUID from the workspace. Catalogue lines snapshot the catalogue ID, list amount, name, description and lookup key. Unknown keys and inconsistencies warn; legacy keys block sending. Custom lines are flagged for scope/price review. Do not invent catalogue IDs or quote a price without checking the workspace's pricing documents.

## Content and review

Supported Markdown: headings, paragraphs, bold, italic and simple ordered/unordered lists, plus known `{{variables}}`. Raw HTML, remote images, links, code blocks, tables, task lists and nested lists are rejected with a precise correction message. The server appends the pricing table and both signature blocks. The manual editor supports embedded images and richer block composition.

Every AI change is attributed to `ai:<connector name>`. Drafts remain marked for human review until a staff member saves them; sending otherwise requires explicit review confirmation. Revision conflicts require rereading the draft. An AI token cannot send, resend, sign, countersign, decline, alter billing/settings, or modify a sent proposal. These restrictions are enforced in the dispatcher, service and staff authorization paths, not merely omitted from tool descriptions.

## Sample prompt

“Draft a proposal for Acme Plumbing from the discovery notes below. Search for the client, read our current pricing document and catalogue, and use the appropriate template. Preserve the exact scope and entered prices. Use a custom service family if no catalogue offering fits, and flag anything uncertain for my review. Save only a draft with the discovery brief; never send or sign it. Run check_ready and tell me what needs review. Discovery notes: …”

Official compatibility references checked 29 October 2026: https://claude.com/docs/connectors/building and https://developers.openai.com/plugins/build/auth . Actual hosted-client acceptance remains pending deployment.

## Quote model v3 (redesign Phase 3)

Draft tool responses include current `items` (also exposed as `quote`). `list_catalog` includes sub-line presets, plan terms and the item defaults. `check_ready` validates the same item model as staff sending. `create_proposal_draft`, `update_proposal_draft` and `set_quote_lines` accept `items` only. Flat `lines` inputs are rejected. Legacy support was removed after the owner confirmed there was no pre-redesign data. No amounts or mappings are inferred or changed.

A new item is:

```json
{
  "id": "00000000-0000-4000-8000-000000000090",
  "order": 0,
  "name": "Monthly retainer",
  "description": "Agreed scope from discovery",
  "source": "custom",
  "pricing_item_id": null,
  "custom_family_id": "FAMILY_UUID",
  "sublines": [{
    "id": "00000000-0000-4000-8000-000000000091",
    "label": "Monthly service",
    "amount": 200000,
    "list_amount": null,
    "qty": 1,
    "interval": "month",
    "stripe_lookup_key": null,
    "qbo_item_ref": null
  }],
  "optional": false,
  "default_selected": true,
  "choice_group_id": null,
  "min_term_months": null,
  "schedule": null,
  "plan_terms": null
}
```

Use UUIDs for item/sub-line/group identities. Intervals are `one_time`, `month`, `year`. To offer alternatives, make every member optional, give them the same `choice_group_id`, and choose at most one `default_selected`. The client must select exactly one before signing. Groups render contiguously and billing receives only the chosen item's sub-lines. Different intervals always remain separate totals.

Amounts are supplied by the author; the app only sums them. AI text remains pending per section. AI-entered catalogue overrides require a staff **Use list price** or **Keep** decision; send confirmation cannot bypass those price holds. Ordinary saving does not mark sections reviewed. An AI tool cannot send, sign, countersign, choose the email sender or approve its own changes. Contract clauses come from the template; conditional clauses are evaluated against selected catalogue item IDs and frozen at signature.

AI assistants cannot delete clients or proposals, change outcomes, archive records, send or sign.


Validity: `create_proposal_draft` and `update_proposal_draft` accept optional `valid_until` (ISO timestamp or null). Omit it on create for the workspace validity default (30 days); pass null to make a draft indefinite. Proposal responses include `valid_until`. `{{proposal.date}}` and `{{proposal.valid_until}}` resolve to readable dates. Prefer `{{proposal.validity}}` for a complete sentence that disappears when indefinite. `check_ready` warns about custom expiry wording on an indefinite proposal. No provider dates, signatures or frozen versions can be edited through these tools.

## Client contact data

`create_client`, `get_client`, `search_clients` and `update_client` expose contact information. `update_client` takes an `id` and the contact fields to change; it requires the draft scope. For example:

```json
{"id":"CLIENT_UUID","phone":"(704) 555-0123","address":{"line1":"123 Main St","line2":"Suite 2","city":"Charlotte","region":"NC","postal_code":"28202","country":"US"}}
```

Phone input defaults to US; international input requires `+country code`. Saving validates and stores E.164. Client responses include `phone` plus `phone_formatted`; a pre-existing invalid unsaved number returns `phone: null`, its original display value, and `phone_needs_review: true`. Address fields are all optional strings; `country` is an alpha-2 country code and defaults to `US`. Supplying an address replaces its contents; use empty strings to clear fields. `address_formatted` and `{{client.address}}` use multiple lines, with no blank paragraph for an absent address.

AI tools cannot set Stripe/QuickBooks customer IDs, link/unlink customers, or delete clients. Staff review case-insensitive exact-email Stripe matches on the client page. `check_ready` reports ambiguous unlinked matches with `customerChoiceUrl`; the staff send endpoint repeats that check. New provider customers receive the saved phone/address. Existing provider addresses are never overwritten.
