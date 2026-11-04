const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const object = (v: any): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** Apply only the fields changed by a step. A text undo must preserve a later move/quote edit. */
export function applyHistoryDelta(current: any, from: any, to: any): any {
  if (equal(from, to)) return current;
  if (
    Array.isArray(from) &&
    Array.isArray(to) &&
    Array.isArray(current) &&
    [...from, ...to].length &&
    [...from, ...to].every((v) => object(v) && typeof v.id === "string")
  ) {
    const before = new Map(from.map((v) => [v.id, v])),
      after = new Map(to.map((v) => [v.id, v]));
    let next = current
      .filter((v) => !before.has(v.id) || after.has(v.id))
      .map((v) =>
        before.has(v.id) && after.has(v.id)
          ? applyHistoryDelta(v, before.get(v.id), after.get(v.id))
          : v,
      );
    for (let i = 0; i < to.length; i++)
      if (!before.has(to[i].id) && !next.some((v) => v.id === to[i].id)) {
        const previous = to
          .slice(0, i)
          .reverse()
          .find((v) => next.some((n) => n.id === v.id));
        const following = to
          .slice(i + 1)
          .find((v) => next.some((n) => n.id === v.id));
        const at = previous
          ? next.findIndex((v) => v.id === previous.id) + 1
          : following
            ? next.findIndex((v) => v.id === following.id)
            : next.length;
        next.splice(at, 0, structuredClone(to[i]));
      }
    const common = (values: any[], other: Map<string, any>) =>
      values.filter((v) => other.has(v.id)).map((v) => v.id);
    if (!equal(common(from, after), common(to, before))) {
      const byId = new Map(next.map((v) => [v.id, v]));
      next = [
        ...to.filter((v) => byId.has(v.id)).map((v) => byId.get(v.id)),
        ...next.filter((v) => !after.has(v.id)),
      ];
    }
    return next;
  }
  if (object(from) && object(to) && object(current)) {
    const next = { ...current };
    for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (equal(from[key], to[key])) continue;
      if (!(key in to)) delete next[key];
      else next[key] = applyHistoryDelta(current[key], from[key], to[key]);
    }
    return next;
  }
  return structuredClone(to);
}
export class EditorHistory<T> {
  past: {
    id: number;
    before: T;
    after: T;
    scope: string;
    time: number;
    group?: string;
  }[] = [];
  future: typeof this.past = [];
  private serial = 0;
  private group: { key: string; step?: number } | null = null;
  beginGroup(key: string) {
    this.group = { key };
  }
  endGroup(key: string) {
    if (this.group?.key === key) this.group = null;
  }
  private version = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  get lastId() {
    return this.past.at(-1)?.id;
  }
  record(before: T, after: T, scope = "document", now = Date.now()) {
    if (equal(before, after)) return;
    const last = this.past.at(-1);
    if (
      last &&
      ((this.group?.step === last?.id && this.group?.step !== undefined) ||
        (!this.group &&
          !last.group &&
          scope.startsWith("text:") &&
          last?.scope === scope &&
          now - last.time < 500)) &&
      !this.future.length
    ) {
      last.after = structuredClone(after);
      last.time = now;
    } else
      this.past.push({
        id: ++this.serial,
        before: structuredClone(before),
        after: structuredClone(after),
        scope,
        time: now,
        ...(this.group ? { group: this.group.key } : {}),
      });
    if (this.group) this.group.step = this.past.at(-1)?.id;
    this.past = this.past.slice(-100);
    this.future = [];
    this.emit();
  }
  undo(current: T, scope?: string, id?: number): T {
    let at =
      id !== undefined
        ? this.past.findIndex((s) => s.id === id)
        : scope
          ? this.past.findLastIndex((s) => s.scope === scope)
          : -1;
    if (at < 0 && id === undefined) at = this.past.length - 1;
    if (at < 0) return current;
    const [step] = this.past.splice(at, 1);
    this.future.push(step);
    this.emit();
    return applyHistoryDelta(current, step.after, step.before);
  }
  redo(current: T, scope?: string): T {
    let at = scope ? this.future.findLastIndex((s) => s.scope === scope) : -1;
    if (at < 0) at = this.future.length - 1;
    if (at < 0) return current;
    const [step] = this.future.splice(at, 1);
    this.past.push(step);
    this.emit();
    return applyHistoryDelta(current, step.before, step.after);
  }
}
