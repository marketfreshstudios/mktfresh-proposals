"use client";
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ComponentPropsWithRef,
} from "react";
import { Eye, EyeOff } from "lucide-react";

/** Native selection behavior with the same field contract in every surface. */
export function Select({
  className = "",
  ...props
}: ComponentPropsWithRef<"select">) {
  return <select {...props} className={`shared-select ${className}`} />;
}

/** One native, keyboard-operable switch. The input itself owns the 44px hit area. */
export function Switch({
  className = "",
  checked,
  defaultChecked = false,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  const ref = useRef<HTMLInputElement>(null);
  const [nativeChecked, setNativeChecked] = useState(defaultChecked);
  useEffect(() => {
    if (checked !== undefined) return;
    setNativeChecked(ref.current?.checked ?? defaultChecked);
    const form = ref.current?.form;
    const reset = () => setNativeChecked(defaultChecked);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [checked, defaultChecked]);
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      role="switch"
      aria-checked={checked ?? nativeChecked}
      checked={checked}
      defaultChecked={checked === undefined ? defaultChecked : undefined}
      onChange={(event) => {
        if (checked === undefined) setNativeChecked(event.target.checked);
        onChange?.(event);
      }}
      className={`shared-switch ${className}`}
    />
  );
}

/** A password field with an eye button that shows or hides what's typed. */
export function PasswordInput({
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Inside a wrapping <label>, the eye button's name would join the field's
  // name ("Password Show password"); name the field by its label text alone.
  useEffect(() => {
    const el = input.current,
      label = el?.closest("label");
    if (!el || !label || el.hasAttribute("aria-labelledby")) return;
    const text = label.querySelector(":scope > span");
    if (!text) return;
    if (!text.id)
      text.id = `password-label-${Math.random().toString(36).slice(2, 10)}`;
    el.setAttribute("aria-labelledby", text.id);
  }, []);
  return (
    <span className={`password-input ${className}`.trim()}>
      <input {...props} ref={input} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        disabled={props.disabled}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? (
          <EyeOff aria-hidden="true" size={18} />
        ) : (
          <Eye aria-hidden="true" size={18} />
        )}
      </button>
    </span>
  );
}
