import type { ButtonHTMLAttributes } from "react";

/** Shared editor header/notice action sizing; leaves commands and state to callers. */
export function EditorButton({
  variant = "outline",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "outline" | "primary";
}) {
  return (
    <button
      type="button"
      className={`editor-button editor-button-${variant} ${className}`}
      {...props}
    />
  );
}
