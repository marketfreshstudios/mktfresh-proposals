import { expect, it } from "vitest";
import { dialogActionRank } from "../src/components/dialog-actions";
it("orders backward actions before forward or destructive ones", () => {
  for (const label of ["Cancel", "Back", "Close", "Keep editing", "Discard"])
    expect(dialogActionRank(label)).toBe(0);
  for (const label of [
    "Save",
    "Delete block",
    "Send invite",
    "Countersign",
    "Reassign",
    "Set password",
  ])
    expect(dialogActionRank(label)).toBe(1);
});
