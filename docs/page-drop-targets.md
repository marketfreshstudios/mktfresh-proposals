# Page-aware editor drop targets

Blocks catalogue, Saved blocks/groups, and pointer gutter moves share one hit-test resolver. It reads existing sheet rectangles plus the live PagePlan; it does not calculate pagination. An empty explicit page has a valid insertion boundary immediately after its marker even when it has no rendered content frame.

The insertion line uses the text column. Side margins and blank space map to the nearest vertical block boundary on that sheet. PAGE gaps choose the closest valid sheet, with ties favoring the following page. Cover-only paper, band rectangles, and pricing/signature/contract interiors reject the drop and clear the indicator. Release coordinates are checked again, so a remembered caret or a formerly valid hover cannot redirect a drop.

Multi-selections keep their members in document order. Moves retain the existing integrity guard (unchanged IDs, count and content); insertion/moves use one history step. Single section-leading blocks still move their existing whole-section range. Keyboard sorting and touch/phone click-insertion remain unchanged. The unpaged saved-group mini editor keeps drag insertion support.

Existing paragraph/list continuations are not new block boundaries: the indicator uses the nearest whole-block boundary on that sheet rather than pretending that a new block can be inserted inside an unsplit source block. Adjacent signature pairs remain a single insertion unit.

No hosted SQL is needed. Pagination, PDF output, signing and billing are unchanged.
