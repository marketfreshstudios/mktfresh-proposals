"use client";
import { createContext, useContext, type ReactNode } from "react";
import { formatMoney, type CentsMode } from "../lib/money";
const MoneyContext = createContext<
  | ((cents: number, currency?: string, display?: "symbol" | "code") => string)
  | null
>(null);
export function MoneyProvider({
  mode = "auto",
  children,
}: {
  mode?: CentsMode;
  children: ReactNode;
}) {
  return (
    <MoneyContext.Provider
      value={(cents, currency, display) =>
        formatMoney(cents, currency, mode, display)
      }
    >
      {children}
    </MoneyContext.Provider>
  );
}
export function useMoney() {
  return useContext(MoneyContext) ?? defaultMoney;
}

function defaultMoney(
  cents: number,
  currency?: string,
  display?: "symbol" | "code",
) {
  return formatMoney(cents, currency, "auto", display);
}
