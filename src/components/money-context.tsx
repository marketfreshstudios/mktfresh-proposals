"use client";
import { createContext, useContext, type ReactNode } from "react";
import { formatMoney, type CentsMode } from "../lib/money";
import { money } from "../lib/presentation";
const MoneyContext = createContext<
  ((cents: number, currency?: string) => string) | null
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
      value={(cents, currency) => formatMoney(cents, currency, mode)}
    >
      {children}
    </MoneyContext.Provider>
  );
}
export function useMoney() {
  return useContext(MoneyContext) ?? money;
}
