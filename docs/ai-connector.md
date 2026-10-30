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
| `create_proposal_draft` | `{"brief":"Discovery notes…","template_id":"TEMPLATE_UUID","client_id":"CLIENT_UUID","title":"Website proposal","content_markdown":"# Scope\n\nPrepared for {{client.company}}.","lines":[LINE]}` |
| `update_proposal_draft` | `{"id":"PROPOSAL_UUID","revision":0,"title":"Reviewed scope","content_markdown":"# Scope\n\nUpdated discovery requirements."}` |
| `set_quote_lines` | `{"id":"PROPOSAL_UUID","revision":1,"lines":[LINE]}` |
| `check_ready` | `{"id":"PROPOSAL_UUID"}` — same blockers and warnings as sending |

A custom monthly line:

```json
{
  "id": "00000000-0000-4000-8000-000000000090",
  "pricing_item_id": null,
  "custom_family_id": "FAMILY_UUID",
  "name": "Monthly retainer",
  "description": "Two articles and one strategy call every month.",
  "amount": 200000,
  "list_amount": null,
  "qty": 1,
  "interval": "month",
  "min_term_months": null,
  "schedule": null,
  "plan_terms": null,
  "stripe_lookup_key": null,
  "qbo_item_ref": null,
  "group": null,
  "optional": false,
  "selected": true
}
```

Use a real family UUID from the workspace. Catalogue lines snapshot the catalogue ID, list amount, name, description and lookup key. Unknown keys and inconsistencies warn; legacy keys block sending. Custom lines are flagged for scope/price review. Do not invent catalogue IDs or quote a price without checking the workspace's pricing documents.

## Content and review

Supported Markdown: headings, paragraphs, bold, italic and simple ordered/unordered lists, plus known `{{variables}}`. Raw HTML, remote images, links, code blocks, tables, task lists and nested lists are rejected with a precise correction message. The server appends the pricing table and both signature blocks. The manual editor supports embedded images and richer block composition.

Every AI change is attributed to `ai:<connector name>`. Drafts remain marked for human review until a staff member saves them; sending otherwise requires explicit review confirmation. Revision conflicts require rereading the draft. An AI token cannot send, resend, sign, countersign, decline, alter billing/settings, or modify a sent proposal. These restrictions are enforced in the dispatcher, service and staff authorization paths, not merely omitted from tool descriptions.

## Sample prompt

“Draft a proposal for Acme Plumbing from the discovery notes below. Search for the client, read our current pricing document and catalogue, and use the appropriate template. Preserve the exact scope and entered prices. Use a custom service family if no catalogue offering fits, and flag anything uncertain for my review. Save only a draft with the discovery brief; never send or sign it. Run check_ready and tell me what needs review. Discovery notes: …”

Official compatibility references checked 29 October 2026: https://claude.com/docs/connectors/building and https://developers.openai.com/plugins/build/auth . Actual hosted-client acceptance remains pending deployment.

## Quote model v3 (redesign Phase 3)

Draft tool responses now include `items` (also exposed as `quote`) and a flattened `lines` compatibility view. `list_catalog` includes sub-line presets, plan terms and the item defaults. `check_ready` validates the same item model as staff sending. `create_proposal_draft`, `update_proposal_draft` and `set_quote_lines` accept **either** `items` **or** the old flat `lines`, never both. Old `lines` inputs remain supported for one release and are converted one-for-one; no amounts or mappings are inferred or changed.

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
