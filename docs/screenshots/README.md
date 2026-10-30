# Phase 2 screenshots

Rendered from the real app using neutral visual fixtures. Provider-specific states are simulated; these images are not evidence of actual provider acceptance. Desktop: 1440px. Phone: 390px. Regenerate with `npm run test:e2e -- e2e/screens.spec.ts`; output is in `.data/evidence/screens/`.

| Screen | Desktop light | Desktop dark | Phone light | Phone dark |
|---|---|---|---|---|
| login | [desktop light](login-desktop-light.png) | [desktop dark](login-desktop-dark.png) | — | — |
| dashboard | [desktop light](dashboard-desktop-light.png) | [desktop dark](dashboard-desktop-dark.png) | — | — |
| proposals | [desktop light](proposals-desktop-light.png) | [desktop dark](proposals-desktop-dark.png) | — | — |
| new | [desktop light](new-desktop-light.png) | [desktop dark](new-desktop-dark.png) | — | — |
| editor | [desktop light](editor-desktop-light.png) | [desktop dark](editor-desktop-dark.png) | — | — |
| send | [desktop light](send-desktop-light.png) | [desktop dark](send-desktop-dark.png) | — | — |
| clients | [desktop light](clients-desktop-light.png) | [desktop dark](clients-desktop-dark.png) | — | — |
| client-detail | [desktop light](client-detail-desktop-light.png) | [desktop dark](client-detail-desktop-dark.png) | — | — |
| catalogue | [desktop light](catalogue-desktop-light.png) | [desktop dark](catalogue-desktop-dark.png) | — | — |
| templates | [desktop light](templates-desktop-light.png) | [desktop dark](templates-desktop-dark.png) | — | — |
| template-editor | [desktop light](template-editor-desktop-light.png) | [desktop dark](template-editor-desktop-dark.png) | — | — |
| content-library | [desktop light](content-library-desktop-light.png) | [desktop dark](content-library-desktop-dark.png) | — | — |
| imports | [desktop light](imports-desktop-light.png) | [desktop dark](imports-desktop-dark.png) | — | — |
| settings | [desktop light](settings-desktop-light.png) | [desktop dark](settings-desktop-dark.png) | — | — |
| assistants | [desktop light](assistants-desktop-light.png) | [desktop dark](assistants-desktop-dark.png) | — | — |
| integrations | [desktop light](integrations-desktop-light.png) | [desktop dark](integrations-desktop-dark.png) | — | — |
| record | [desktop light](record-desktop-light.png) | [desktop dark](record-desktop-dark.png) | — | — |
| countersign | [desktop light](countersign-desktop-light.png) | [desktop dark](countersign-desktop-dark.png) | — | — |
| audit | [desktop light](audit-desktop-light.png) | [desktop dark](audit-desktop-dark.png) | — | — |
| archive | [desktop light](archive-desktop-light.png) | [desktop dark](archive-desktop-dark.png) | — | — |
| client-password | [desktop light](client-password-desktop-light.png) | [desktop dark](client-password-desktop-dark.png) | [phone light](client-password-phone-light.png) | [phone dark](client-password-phone-dark.png) |
| client-reading | [desktop light](client-reading-desktop-light.png) | [desktop dark](client-reading-desktop-dark.png) | [phone light](client-reading-phone-light.png) | [phone dark](client-reading-phone-dark.png) |
| client-stale | [desktop light](client-stale-desktop-light.png) | [desktop dark](client-stale-desktop-dark.png) | [phone light](client-stale-phone-light.png) | [phone dark](client-stale-phone-dark.png) |
| client-sign | [desktop light](client-sign-desktop-light.png) | [desktop dark](client-sign-desktop-dark.png) | [phone light](client-sign-phone-light.png) | [phone dark](client-sign-phone-dark.png) |
| client-billing | [desktop light](client-billing-desktop-light.png) | [desktop dark](client-billing-desktop-dark.png) | [phone light](client-billing-phone-light.png) | [phone dark](client-billing-phone-dark.png) |
| client-signed | [desktop light](client-signed-desktop-light.png) | [desktop dark](client-signed-desktop-dark.png) | [phone light](client-signed-phone-light.png) | [phone dark](client-signed-phone-dark.png) |
| client-completed | [desktop light](client-completed-desktop-light.png) | [desktop dark](client-completed-desktop-dark.png) | [phone light](client-completed-phone-light.png) | [phone dark](client-completed-phone-dark.png) |
| client-ended | [desktop light](client-ended-desktop-light.png) | [desktop dark](client-ended-desktop-dark.png) | [phone light](client-ended-phone-light.png) | [phone dark](client-ended-phone-dark.png) |

Company signatory review: [delegated counter-sign](company-delegation.png). The fixture uses a synthetic one-pixel PNG, not a real person's signature. Settings, counter-sign, audit and client captures were refreshed for designated-signatory display.

Staff sender update: Settings and Send refreshed; new [Team (light)](team-desktop-light.png) and [Team (dark)](team-desktop-dark.png) captures show display-name management.

Linked-reference status fixtures (including a failed refresh retaining version v7):

| Screen | Light | Dark |
|---|---|---|
| Reference settings | [Light](references-settings-desktop-light.png) | [Dark](references-settings-desktop-dark.png) |
| Reference dashboard | [Light](references-dashboard-desktop-light.png) | [Dark](references-dashboard-desktop-dark.png) |

These additional captures are generated by `e2e/documents.spec.ts` at 1440px desktop width.

Inactive template default fixtures (generated by e2e/template-warnings.spec.ts):

| Screen | Light | Dark |
|---|---|---|
| Template warnings | [Light](template-inactive-defaults-desktop-light.png) | [Dark](template-inactive-defaults-desktop-dark.png) |
| Pricing settings warnings | [Light](pricing-template-warnings-desktop-light.png) | [Dark](pricing-template-warnings-desktop-dark.png) |

Staff client-preview fixtures are generated by e2e/client-preview.spec.ts. Each step has desktop/phone captures in both themes: preview-read, preview-sign and preview-billing (for example [phone signing](preview-sign-phone-light.png) and [desktop billing](preview-billing-desktop-dark.png)).


## Redesign Phase 4

The [Phase 4 comparison gallery](phase4/index.html) contains 73 record/Home/list/client/validity/inline-client/Studio captures and 44 editor captures at 375/768/1440 in both themes, beside matching source frames (3a–3f, 6a–6f, 2a–2f and tablet editor references). These are neutral fixtures, not provider acceptance or real signature evidence. Countersign upper-summary and lower consent states are both included.

Regenerate with `npx playwright test e2e/redesign-records.spec.ts e2e/redesign-quote-editor.spec.ts`. Raw output and manifests appear in `.data/evidence/phase4` and `.data/evidence/quote-editor`; run `node --import tsx scripts/package-phase4-evidence.ts` to rebuild the committed comparison gallery. CI uploads the complete evidence folder. The committed gallery also includes the source frames for review.
