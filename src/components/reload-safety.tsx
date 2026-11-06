"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Guard = {
  blocked?: boolean;
  pending?: boolean;
  flush?: () => Promise<boolean>;
};
const Safety = createContext<{
  register: (key: symbol, guard: { current: Guard }) => () => void;
  changed: () => void;
  prepare: () => Promise<boolean>;
  blocked: boolean;
  revision: number;
} | null>(null);
export function ReloadSafetyProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<symbol, { current: Guard }>()),
    [revision, setRevision] = useState(0);
  const changed = useCallback(() => setRevision((n) => n + 1), []);
  const register = useCallback(
    (key: symbol, guard: { current: Guard }) => {
      guards.current.set(key, guard);
      changed();
      return () => {
        guards.current.delete(key);
        changed();
      };
    },
    [changed],
  );
  const prepare = useCallback(async () => {
    const blocked = () =>
      [...guards.current.values()].some((g) => g.current.blocked);
    if (blocked()) return false;
    for (const guard of [...guards.current.values()]) {
      try {
        if (guard.current.flush && !(await guard.current.flush())) return false;
      } catch {
        return false;
      }
    }
    return !blocked();
  }, []);
  return (
    <Safety.Provider
      value={{
        register,
        changed,
        prepare,
        revision,
        blocked: [...guards.current.values()].some((g) => g.current.blocked),
      }}
    >
      {children}
    </Safety.Provider>
  );
}
/** Register the existing saver, or block reload until an explicit edit is saved. */
export function useReloadGuard(guard: Guard) {
  const safety = useContext(Safety),
    latest = useRef(guard),
    key = useRef(Symbol("reload guard"));
  latest.current = guard;
  const register = safety?.register,
    changed = safety?.changed;
  useEffect(() => register?.(key.current, latest), [register]);
  useEffect(() => {
    changed?.();
  }, [changed, guard.blocked, guard.pending]);
}
export function useReloadSafety() {
  const value = useContext(Safety);
  if (!value) throw new Error("Reload safety requires staff context");
  return value;
}
