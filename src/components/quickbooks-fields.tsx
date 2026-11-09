"use client";

import { useEffect, useState } from "react";
import { Select } from "./form-controls";
import { api, Field } from "./ui";

export function QuickBooksPicker({
  label,
  name,
  initial,
  enabled,
  disabled = false,
  kind = "items",
  emptyLabel,
  onChange,
}: {
  label: string;
  name?: string;
  initial?: string | null;
  enabled: boolean;
  disabled?: boolean;
  kind?: "items" | "terms";
  emptyLabel: string;
  onChange?: (value: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState("");
  useEffect(() => setValue(initial ?? ""), [initial]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        setError("");
        api<{ id: string; name: string }[]>(
          `/api/connections/qbo/${kind}?q=${encodeURIComponent(search)}`,
          { signal: abort.signal },
        )
          .then((items) => {
            if (
              !Array.isArray(items) ||
              items.some(
                (item) =>
                  typeof item?.id !== "string" ||
                  typeof item?.name !== "string",
              )
            )
              throw new Error(
                "QuickBooks choices are temporarily unavailable.",
              );
            if (!abort.signal.aborted) setChoices(items);
          })
          .catch((error) => {
            if (!abort.signal.aborted) setError((error as Error).message);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [enabled, kind, search]);
  return (
    <div className="stack">
      {enabled && !disabled && kind === "items" && (
        <Field label={`Search ${label.toLowerCase()} by name`}>
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </Field>
      )}
      <Field label={label}>
        {name && (!enabled || disabled) && (
          <input type="hidden" name={name} value={value} />
        )}
        <Select
          name={name}
          value={value}
          disabled={!enabled || disabled}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setValue(next);
            onChange?.(next || null);
          }}
        >
          <option value="">{emptyLabel}</option>
          {value && !choices.some((choice) => choice.id === value) && (
            <option value={value}>Current mapping</option>
          )}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </Select>
      </Field>
      {!enabled && (
        <small>
          Connect QuickBooks to choose{" "}
          {kind === "items" ? "an item" : "invoice terms"}.
        </small>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
