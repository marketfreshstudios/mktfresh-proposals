/** Owner 10 Nov: counts in tabs sit in the shared count chip (the Home
 * section count): small rectangular chip, cool gray, tabular numbers. The
 * selected tab's chip is filled ink (see .count-chip in ink-clay.css). */
export function CountChip({ count }: { count: number | undefined }) {
  return <span className="count-chip">{count ?? "–"}</span>;
}
