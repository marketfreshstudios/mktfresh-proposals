# Header/footer PR 3 — overrides and touch editing

Builds on merged PR #59 (`9cd16b4`). Scope: anchor resolution and lifecycle, shared/unique/hidden menus, confirmations and Undo, reflow notes, cover pills, Styles/Sections indicators, and tablet/phone band editing. Client pages, geometry functions, PagePlan, billing, readiness and AI tools remain unchanged.

## Owner questions

1. For two consecutive non-cover pages starting in the same block, use `<id>` then `<id>#2` too? The prompt names 3+ pages; two pages also need distinct keys, stable when another continuation appears.
2. If reflow puts two existing override anchors on one page, or a deleted anchor must transfer onto an already-overridden destination, which override should be displayed and how should the other be retained? The spec does not define collision behavior.
3. On a hidden band, should “Edit this page's header/footer” create an empty unique band using the shared layout, while “Use shared” restores the shared content through the normal confirm?

## Reference review

Viewed Redesign 13 frames 1d–1k, 2a–2c and the spec card in a browser. The tablet bar has More and Done; the phone bar omits Line and moves Done to the phone header. Template settings remain shared-only, as required by DECISIONS §5.
