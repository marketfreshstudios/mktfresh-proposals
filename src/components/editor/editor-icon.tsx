import { createElement } from "react";
import icons from "./editor-icons.json";
type Name = Exclude<keyof typeof icons, "_about" | "_existing">;
/** Paths are supplied by the editor prototype; keep them verbatim. */
export function EditorIcon({ name, size = 16 }: { name: Name; size?: number }) {
  const icon = icons[name];
  const [, , width, height] = icon.viewBox.split(" ").map(Number);
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={(size * height) / width}
      viewBox={icon.viewBox}
      style={
        "mirror" in icon && icon.mirror
          ? { transform: "scaleX(-1)" }
          : undefined
      }
    >
      {icon.els.map(([tag, attributes], n) => {
        const { children, ...props } = attributes as Record<string, any>;
        return createElement(tag as string, { ...props, key: n }, children);
      })}
    </svg>
  );
}
