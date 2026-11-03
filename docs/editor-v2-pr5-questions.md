# Editor v2 PR 5 — measured preflight question

Base: main `7225eab` (merged PR #54). Before application changes, `scripts/capture-editor-v2-alignment.ts before` opened the supplied Redesign 10 prototype and the current editor at 1440px, captured Quote/Fields/Styles/Send, Sections and the sheet, and rendered side-by-side pairs. The prototype uses the bundled local font files for reproducible measurements; its source is unchanged.

The owner says the prototype wins and to ask in the PR when unclear. The browser measurements conflict with the explicit panel field values in B/D:

| Field | Prototype computed | PR 5 requested |
| --- | --- | --- |
| Quote item name | 36px high, 8px radius, 14px/600 | 40px high, 10px radius, 15px/600 |
| Quote interval | 36px high, 8px radius | 40px high, 10px radius |
| Styles margins | 34px high, 8px radius | shared 40px / 10px panel input style |
| Styles level/font/size | 38px high, 9px radius | shared 40px / 10px panel input style |
| Styles weight/spacing | 36px high, 8px radius | shared 40px / 10px panel input style |

Should the explicit PR 5 field values (40px/10px and the 15px item name) override those literal prototype values, with the prototype governing the rest, or should the literal prototype sizes win? This was asked before changing application code; the owner resolution is recorded below.

## Owner answer — resolved

Use the prototype's measured sizes exactly: 36px Quote controls, 34–38px Styles controls, its 8–9px corners and 14px/600 item name. The prompt's 40px/10px/15px values were approximations; the prototype governs whenever they differ. Keep 44px touch targets on phone only, following Redesign 11.

## TEST 3 fixture — resolved

Jonathan authorized the exact proposal API/editor for read-only inspection, with browser writes blocked. Raw JSON and inspection images remain gitignored. The committed regression uses neutral identities, the same block/list structure and lengths, Montserrat / DM Sans, and Standard density with the original default margins. No live proposal/customer identifiers are committed.
