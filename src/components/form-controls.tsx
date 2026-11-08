"use client";
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";

/** Native selection behavior with the same field contract in every surface. */
export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
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
