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

Should the explicit PR 5 field values (40px/10px and the 15px item name) override those literal prototype values, with the prototype governing the rest, or should the literal prototype sizes win? These panel edits remain pending an owner answer. Pagination investigation is independent. No application code, PagePlan, hash or PDF code has changed.
