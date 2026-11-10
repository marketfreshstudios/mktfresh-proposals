"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  themes,
  formatStaffDate,
  type StaffAccount,
  type StaffAccountPatch,
  type StaffTheme,
} from "../lib/staff-account-model";
import { api } from "./ui";
import { ToastSurface } from "./toast-surface";

const storageKey = "yeswell-staff-theme";
export function browserStaffTheme(): StaffTheme {
  const saved = localStorage.getItem(storageKey);
  if (themes.includes(saved as StaffTheme)) return saved as StaffTheme;
  const legacy = localStorage.getItem("proposal-theme");
  return legacy === "dark" || legacy === "light" ? legacy : "system";
}
export function applyStaffTheme(theme: StaffTheme) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    document.documentElement.dataset.theme =
      theme === "system" ? (query.matches ? "dark" : "light") : theme;
  };
  apply();
  if (theme === "system") query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}

type AccountContext = {
  account?: StaffAccount;
  theme: StaffTheme;
  save: (
    patch: StaffAccountPatch,
    undo?: StaffAccountPatch,
    options?: { quiet?: boolean },
  ) => Promise<StaffAccount | undefined>;
  setTheme: (theme: StaffTheme) => Promise<void>;
  accept: (account: StaffAccount) => void;
  saved: () => void;
};
const Context = createContext<AccountContext | null>(null);
export function useStaffAccount() {
  return useContext(Context);
}
export function StaffAccountProvider({
  account,
  onChanged,
  children,
}: {
  account?: StaffAccount;
  onChanged?: (account: StaffAccount) => void;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<StaffTheme>("system");
  const [toast, setToast] = useState<{
    undo?: StaffAccountPatch;
    error?: string;
  } | null>(null);
  const queue = useRef(Promise.resolve<unknown>(undefined));
  useEffect(() => {
    setThemeState(account?.theme ?? browserStaffTheme());
  }, [account?.theme]);
  useEffect(() => applyStaffTheme(theme), [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  function accept(next: StaffAccount) {
    onChanged?.(next);
  }
  function save(
    patch: StaffAccountPatch,
    undo?: StaffAccountPatch,
    options?: { quiet?: boolean },
  ) {
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        const next = await api<StaffAccount>("/api/account", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        accept(next);
        if (!options?.quiet) setToast({ undo });
        return next;
      });
    queue.current = operation;
    return operation;
  }
  async function setTheme(next: StaffTheme) {
    if (theme === next) return;
    const previous = theme;
    setThemeState(next);
    try {
      if (account) await save({ theme: next }, { theme: previous });
      else setToast({});
      localStorage.setItem(storageKey, next);
    } catch (error) {
      setThemeState(previous);
      setToast({ error: (error as Error).message });
    }
  }
  useEffect(() => {
    if (!account?.theme) return;
    localStorage.setItem(storageKey, account.theme);
  }, [account?.theme]);
  return (
    <Context.Provider
      value={{
        account,
        theme,
        save,
        setTheme,
        accept,
        saved: () => setToast({}),
      }}
    >
      {children}
      {toast && (
        <ToastSurface
          role={toast.error ? "alert" : "status"}
          onDismiss={() => setToast(null)}
        >
          <span>{toast.error ?? "Saved"}</span>
          {toast.undo && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                void save(toast.undo!).catch((error: Error) =>
                  setToast({ error: error.message }),
                );
              }}
            >
              Undo
            </button>
          )}
        </ToastSurface>
      )}
    </Context.Provider>
  );
}

export function useStaffDates(defaultZone?: string) {
  const account = useStaffAccount()?.account;
  const timezone = account?.timezone ?? defaultZone;
  function date(
    value: string | Date | null | undefined,
    fallback: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  ) {
    if (!value) return "Not yet";
    return formatStaffDate(value, account, {
      ...fallback,
      timeZone: defaultZone,
    });
  }
  function time(
    value: string | Date,
    options: Intl.DateTimeFormatOptions = {
      hour: "numeric",
      minute: "2-digit",
    },
  ) {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: timezone,
    }).format(new Date(value));
  }
  return {
    timezone,
    date,
    time,
    personal: Boolean(account?.timezone || account?.date_format),
  };
}
