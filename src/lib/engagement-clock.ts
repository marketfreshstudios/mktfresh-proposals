import type { EngagementAction, EngagementSnapshot } from "./engagement";
/** Cumulative counters survive lost/reordered beacons. No wall-clock dates supplied by the browser. */
export class EngagementClock {
  snapshot: EngagementSnapshot = {
    seq: 1,
    active_ms: 0,
    targets: {},
    actions: [],
    ended: false,
  };
  private last: number;
  private activityAt: number;
  private focused = false;
  private visible: string[] = [];
  constructor(now: number) {
    this.last = Math.floor(now);
    this.activityAt = Math.floor(now);
  }
  step(now: number, focused: boolean, visible: string[]) {
    now = Math.floor(now);
    const elapsed =
      this.focused && this.visible.length
        ? Math.max(0, Math.min(now, this.activityAt + 60000) - this.last)
        : 0;
    if (elapsed) {
      this.snapshot.active_ms += elapsed;
      for (const key of this.visible)
        this.snapshot.targets[key] =
          (this.snapshot.targets[key] ?? 0) + elapsed;
    }
    this.last = Math.floor(now);
    this.focused = focused;
    this.visible = visible;
  }
  activity(now: number) {
    this.activityAt = Math.floor(now);
  }
  action(action: EngagementAction) {
    if (
      this.snapshot.actions.length < 128 &&
      !this.snapshot.actions.some((a) => a.id === action.id)
    )
      this.snapshot.actions.push(action);
  }
  batch(ended = false) {
    this.snapshot.seq++;
    this.snapshot.ended = ended;
    return structuredClone(this.snapshot);
  }
}
