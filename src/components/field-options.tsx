"use client";
import {
  useRef,
  useState,
  useEffect,
  useId,
  type TextareaHTMLAttributes,
} from "react";
import { fieldGroup, fieldLabel } from "../lib/field-labels";
import { useBlockToolbar } from "./block-controls";
import { useVisibleEditorAction } from "./use-visible-editor-action";
import { Button } from "./ui";
export function FieldOptions({
  map,
  onInsert,
  search = true,
  variant = "panel",
}: {
  map: Record<string, string>;
  onInsert: (path: string) => void;
  search?: boolean;
  variant?: "panel" | "menu";
}) {
  const [query, setQuery] = useState("");
  const keys = Object.keys(map).filter((path) =>
    `${fieldLabel(path)} ${path}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={`field-options field-options-${variant}`}>
      {search && (
        <label className="field">
          Search fields
          <input
            aria-label="Search fields"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {["Client", "Proposal", "Sender & workspace", "Totals"].map((group) => {
        const items = keys.filter((path) => fieldGroup(path) === group);
        return items.length ? (
          <section key={group} className="field-option-group">
            <h3>{group}</h3>
            {items.map((path) => (
              <button
                type="button"
                className="field-option"
                data-field-insert
                key={path}
                onClick={() => onInsert(path)}
                aria-label={`${fieldLabel(path)} — {{${path}}}`}
              >
                <span className="field-option-label">{fieldLabel(path)}</span>
                {variant === "menu" && <code>{`{{${path}}}`}</code>}
                <span
                  className="field-option-value"
                  title={map[path] || "Empty"}
                >
                  {map[path] && map[path] !== `{{${path}}}` ? map[path] : "—"}
                </span>

                {variant === "panel" && <code>{`{{${path}}}`}</code>}
              </button>
            ))}
          </section>
        ) : null;
      })}
      {!keys.length && <p className="muted">No matching fields</p>}
    </div>
  );
}
/** Plain-text subjects keep their selection when the menu takes focus. */
export function SubjectField({
  value,
  onChange,
  map,
  disabled = false,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  map: Record<string, string>;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null),
    selection = useRef<{ start: number; end: number } | null>(null);
  const [open, setOpen] = useState(false);
  const remember = () => {
    const el = ref.current;
    if (el)
      selection.current = {
        start: el.selectionStart ?? value.length,
        end: el.selectionEnd ?? value.length,
      };
  };
  return (
    <div className="subject-field">
      <input
        ref={ref}
        aria-label="Subject"
        value={value}
        maxLength={300}
        disabled={disabled}
        readOnly={readOnly}
        onSelect={remember}
        onBlur={remember}
        onChange={(e) => {
          onChange(e.target.value);
          if (
            e.target.value.slice(
              Math.max(0, (e.target.selectionStart ?? 0) - 2),
              e.target.selectionStart ?? 0,
            ) === "{{"
          )
            setOpen(true);
        }}
      />
      {!readOnly && (
        <Button disabled={disabled} onClick={() => setOpen(!open)}>
          Insert field in subject
        </Button>
      )}
      {open && (
        <div className="subject-field-menu">
          <FieldOptions
            map={map}
            variant="menu"
            onInsert={(path) => {
              let { start, end } = selection.current ?? {
                start: value.length,
                end: value.length,
              };
              if (value.slice(Math.max(0, start - 2), start) === "{{")
                start -= 2;
              const token = `{{${path}}}`;
              onChange(value.slice(0, start) + token + value.slice(end));
              setOpen(false);
              selection.current = {
                start: start + token.length,
                end: start + token.length,
              };
              requestAnimationFrame(() => {
                ref.current?.focus();
                ref.current?.setSelectionRange(
                  start + token.length,
                  start + token.length,
                );
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Controlled plain-text headings retain their own selection across sidebar focus. */
export function FieldTextArea({
  value,
  onValue,
  onBeforeInsert,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValue: (text: string) => void;
  onBeforeInsert?: () => void;
}) {
  const scope = useBlockToolbar(),
    id = useId(),
    ref = useRef<HTMLTextAreaElement>(null),
    latest = useRef({ value, onValue, onBeforeInsert }),
    cursor = useRef<{ start: number; end: number } | null>(null);
  const afterVisible = useVisibleEditorAction();
  latest.current = { value, onValue, onBeforeInsert };
  const remember = () => {
    if (ref.current)
      cursor.current = {
        start: ref.current.selectionStart,
        end: ref.current.selectionEnd,
      };
  };
  useEffect(() => {
    if (!scope) return;
    return scope.register(id, {
      rich: false,
      block:
        ref.current?.closest<HTMLElement>(".block-frame")?.dataset.blockId ??
        null,
      insert: (path, atEnd) => {
        latest.current.onBeforeInsert?.();
        const { value, onValue } = latest.current,
          range = atEnd ? null : cursor.current,
          start = range?.start ?? value.length,
          end = range?.end ?? start,
          token = `{{${path}}}`;
        onValue(value.slice(0, start) + token + value.slice(end));
        if (!ref.current) return;
        afterVisible(ref.current, () => {
          ref.current?.focus();
          ref.current?.setSelectionRange(
            start + token.length,
            start + token.length,
          );
        });
      },
    });
  }, [id, !!scope]);
  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      onFocus={() => scope?.remember(id)}
      onSelect={remember}
      onBlur={remember}
    />
  );
}
