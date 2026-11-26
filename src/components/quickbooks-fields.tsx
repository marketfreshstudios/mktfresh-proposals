"use client";

import { useEffect, useId, useState } from "react";
import { Select } from "./form-controls";
import { staffIcons } from "./staff-icons";
import { api, Field } from "./ui";

type Choice = { id: string; name: string };

export function useQuickBooksItemName(ref?: string | null, enabled = true) {
  const [item, setItem] = useState<Choice | null>(null);
  useEffect(() => {
    if (!enabled || !ref) return;
    const abort = new AbortController();
    api<Choice | null>(
      `/api/connections/qbo/items?ref=${encodeURIComponent(ref)}`,
      { signal: abort.signal },
    )
      .then((result) => {
        if (!abort.signal.aborted) setItem(result);
      })
      .catch(() => {});
    return () => abort.abort();
  }, [ref, enabled]);
  return item?.id === ref ? item?.name : undefined;
}

type PickerProps = {
  label: string;
  name?: string;
  initial?: string | null;
  enabled: boolean;
  disabled?: boolean;
  kind?: "items" | "terms";
  emptyLabel: string;
  onChange?: (value: string | null) => void;
};

function useChoices(kind: "items" | "terms", search: string, enabled: boolean) {
  const [result, setResult] = useState<{
    search: string;
    choices: Choice[];
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const timer = setTimeout(
      () => {
        api<Choice[]>(
          `/api/connections/qbo/${kind}?q=${encodeURIComponent(search)}`,
          { signal: abort.signal },
        )
          .then((choices) => {
            if (
              !Array.isArray(choices) ||
              choices.some(
                (choice) =>
                  typeof choice?.id !== "string" ||
                  typeof choice?.name !== "string",
              )
            )
              throw new Error(
                "QuickBooks choices are temporarily unavailable.",
              );
            if (!abort.signal.aborted) setResult({ search, choices });
          })
          .catch((error: Error) => {
            if (!abort.signal.aborted)
              setResult({ search, choices: [], error: error.message });
          });
      },
      search ? 250 : 0,
    );
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [enabled, kind, search]);
  return result?.search === search ? result : undefined;
}

export function QuickBooksPicker(props: PickerProps) {
  return props.kind === "terms" ? (
    <TermsPicker {...props} />
  ) : (
    <ItemPicker {...props} />
  );
}

function ItemPicker({
  label,
  name,
  initial,
  enabled,
  disabled = false,
  emptyLabel,
  onChange,
}: PickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(initial ?? "");
  const [selected, setSelected] = useState<Choice>();
  const [active, setActive] = useState(-1);
  const interactive = enabled && !disabled;
  const expanded = interactive && open;
  const result = useChoices("items", query.trim(), expanded);
  const choices = [
    ...(!query.trim() ? [{ id: "", name: emptyLabel }] : []),
    ...(result?.choices ?? []),
  ];
  const savedName = useQuickBooksItemName(
    value,
    enabled && selected?.id !== value,
  );
  const currentName = value
    ? ((selected?.id === value ? selected.name : savedName) ??
      "Current mapping")
    : emptyLabel;
  const Chevron = staffIcons["chevron-down"];

  useEffect(() => setValue(initial ?? ""), [initial]);
  useEffect(() => {
    if (expanded && choices[active])
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [expanded, active, id, result]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(-1);
  };
  const choose = (choice: Choice) => {
    setSelected(choice);
    setValue(choice.id);
    onChange?.(choice.id || null);
    close();
  };

  return (
    <div className="field quickbooks-item-picker">
      <label htmlFor={id}>{label}</label>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="quickbooks-combobox">
        <input
          id={id}
          role="combobox"
          type="text"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? id + "-list" : undefined}
          aria-activedescendant={
            expanded && choices[active] ? id + "-option-" + active : undefined
          }
          aria-describedby={!enabled ? id + "-connect" : undefined}
          disabled={!interactive}
          value={expanded ? query : currentName}
          placeholder={
            expanded
              ? value
                ? currentName
                : "Search QuickBooks items"
              : undefined
          }
          maxLength={100}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.currentTarget.value);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && expanded) {
              event.preventDefault();
              event.stopPropagation();
              close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              const last = choices.length - 1;
              setActive((index) =>
                event.key === "ArrowDown"
                  ? Math.min(last, index + 1)
                  : index <= 0
                    ? last
                    : index - 1,
              );
            } else if (event.key === "Enter" && expanded) {
              event.preventDefault();
              if (choices[active]) choose(choices[active]);
            }
          }}
        />
        <Chevron
          size={16}
          aria-hidden="true"
          className="quickbooks-combobox-chevron"
        />
        {expanded && (
          <div className="quickbooks-combobox-menu">
            <ul
              id={id + "-list"}
              role="listbox"
              aria-label={label}
              aria-busy={!result}
            >
              {choices.map((choice, index) => (
                <li
                  key={choice.id}
                  id={id + "-option-" + index}
                  role="option"
                  aria-selected={choice.id === value}
                  data-active={index === active || undefined}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(choice)}
                >
                  {choice.name}
                </li>
              ))}
            </ul>
            {result?.error ? (
              <small role="alert">{result.error}</small>
            ) : !result ? (
              <small role="status">Loading items…</small>
            ) : !result.choices.length ? (
              <small role="status">No matching QuickBooks items.</small>
            ) : null}
          </div>
        )}
      </div>
      {!enabled && (
        <small id={id + "-connect"}>
          Connect QuickBooks to choose an item.
        </small>
      )}
    </div>
  );
}

function TermsPicker({
  label,
  name,
  initial,
  enabled,
  disabled = false,
  emptyLabel,
  onChange,
}: PickerProps) {
  const result = useChoices("terms", "", enabled);
  const choices = result?.choices ?? [];
  const value = initial ?? "";
  return (
    <div className="stack">
      <Field label={label}>
        {name && (!enabled || disabled) && (
          <input type="hidden" name={name} value={value} />
        )}
        <Select
          name={name}
          value={value}
          disabled={!enabled || disabled}
          onChange={(event) => onChange?.(event.currentTarget.value || null)}
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
      {!enabled && <small>Connect QuickBooks to choose invoice terms.</small>}
      {result?.error && <small role="alert">{result.error}</small>}
    </div>
  );
}
