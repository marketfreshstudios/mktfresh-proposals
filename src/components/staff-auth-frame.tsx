"use client";
import { useEffect, useState, type ReactNode } from "react";
import { YeswellBrand } from "./yeswell-brand";

/** Account screens share the same centered frame before a workspace is known. */
export function StaffAuthFrame({ children }: { children: ReactNode }) {
  const [host, setHost] = useState("");
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("proposal-theme") === "dark" ? "dark" : "light";
    setHost(location.host);
  }, []);
  return (
    <main className="login staff-foundation ink-clay yeswell-auth account-screen">
      <div className="account-frame">
        <YeswellBrand />
        <div className="card stack">{children}</div>
        <p className="account-workspace">
          Yeswell workspace{host ? ` · ${host}` : ""}
        </p>
      </div>
    </main>
  );
}
