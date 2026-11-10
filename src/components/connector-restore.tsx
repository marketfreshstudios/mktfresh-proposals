"use client";
import { useState } from "react";
import { confirmDialog } from "./dialog-actions";
import { post } from "./ui";
import { ToastSurface } from "./toast-surface";
export function useConnectorRestore(
  onRestored: (value: any) => void | Promise<void>,
  beforeRestore?: () => Promise<boolean>,
) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const restore = async (eventId: string) => {
    if (busy) return;
    setError("");
    if (
      !(await confirmDialog({
        title: "Restore previous version?",
        description:
          "Replace this connector change with the version saved before it. Later staff edits are protected. Proposals already created from it do not change.",
        confirmLabel: "Restore previous version",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      if (beforeRestore && !(await beforeRestore())) return;
      const value = await post(`/api/studio-history/${eventId}/restore`, {});
      await onRestored(value);
      setMessage("Previous version restored");
      setTimeout(() => setMessage(""), 5000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return {
    restore,
    busy,
    feedback: (
      <>
        {message && (
          <ToastSurface onDismiss={() => setMessage("")}>
            {message}
          </ToastSurface>
        )}
        {error && (
          <ToastSurface role="alert" onDismiss={() => setError("")}>
            {error}
          </ToastSurface>
        )}
      </>
    ),
  };
}
