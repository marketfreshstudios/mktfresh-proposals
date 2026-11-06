export type ReloadGuard = {
  blocked?: boolean;
  pending?: boolean;
  hasPendingWork?: () => boolean;
  flush?: () => Promise<boolean>;
};
/** Re-read after each drain: typing or navigation during a save can add work. */
export async function prepareReload(read: () => { current: ReloadGuard }[]) {
  while (true) {
    const before = read();
    if (before.some((g) => g.current.blocked)) return false;
    for (const guard of before) {
      try {
        if (guard.current.flush && !(await guard.current.flush())) return false;
      } catch {
        return false;
      }
    }
    const after = read();
    if (
      after.some(
        (g) =>
          g.current.blocked ||
          (g.current.hasPendingWork?.() && !g.current.flush),
      )
    )
      return false;
    if (after.every((g) => before.includes(g) && !g.current.hasPendingWork?.()))
      return true;
  }
}
