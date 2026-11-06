# Studio v3 email editor — scope questions

The Studio v3 spec takes precedence over the prototype. The real email renderer and current defaults stay the source of the canvas; sending logic and data formats are unchanged.

1. §2.4 refers to existing per-email field allow-lists, but the implementation has one global `emailFields` map and global validation. Proposed Phase 1 scope: filter the picker only (Team = team/sender/workspace; Job = job/proposal; client = client/proposal/quote/sender/workspace), retaining existing saved content and server validation/rendering. No migration or sending change.
2. The current shared email toolbar also offers Size and Undo/Redo, while §5.3 draws B/I/lists/link/Field. Proposed: keep the six primary actions visible, with existing Size and history commands in More; keyboard undo/redo remains available. No inert commands and no loss of existing formatting.

Carry-over work and the independent editor shell can continue while these questions are resolved.
