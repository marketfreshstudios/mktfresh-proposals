import { expect, it } from "vitest";
import {
  pageCountLabel,
  sharedPagesLabel,
  sharedChangesLabel,
} from "../src/lib/page-count";
it("pluralizes page counts and uses this-page-only copy for one shared page", () => {
  expect(pageCountLabel(0)).toBe("0 pages");
  expect(pageCountLabel(1)).toBe("1 page");
  expect(pageCountLabel(2)).toBe("2 pages");
  expect(sharedPagesLabel(1)).toBe("Shared on 1 page");
  expect(sharedPagesLabel(7)).toBe("Shared on 7 pages");
  expect(sharedChangesLabel(0)).toBe("Changes show on 0 pages");
  expect(sharedChangesLabel(1)).toBe("Changes show on this page only");
  expect(sharedChangesLabel(7)).toBe("Changes show on all 7 pages");
});
