"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Ellipsis } from "lucide-react";
import { ToolbarPopover } from "../toolbar-popover";
import { BlockActionPresentation } from "./edit-bar";
import { useControlLayout } from "./control-layout";
import { placeEditorToolbar } from "./toolbar-placement";
import { useStyleClipboard } from "./style-clipboard";

export function ColumnActionBar({
  owner,
  itemKey,
  label,
  group,
  onStyle,
  onAdd,
  onLayout,
  onUnwrap,
  onDelete,
  tools,
}: {
  owner: RefObject<HTMLElement | null>;
  itemKey: string;
  label: string;
  group?: string;
  onStyle: () => void;
  onAdd?: (anchor: HTMLButtonElement) => void;
  onLayout?: () => void;
  onUnwrap?: () => void;
  onDelete?: () => void;
  tools?: ReactNode;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const clipboard = useStyleClipboard()!;
  const { phone } = useControlLayout();
  const hasStyle = !!clipboard.styleClipboard;
  const pasteTitle = hasStyle ? "Paste style" : "Copy a style first";
  const gap = onAdd ? (hasStyle ? 36 : 28) : 6;
  useLayoutEffect(() => {
    const target = owner.current;
    const surface = bar.current;
    if (!target || !surface || phone) return;
    const place = () =>
      placeEditorToolbar(target, surface, {
        gap,
        withinCanvas: true,
      });
    const observer = new ResizeObserver(place);
    observer.observe(target);
    observer.observe(surface);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    place();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [owner, phone, gap]);

  const command = (fn: () => void) => () => {
    setMore(false);
    fn();
  };
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div
      ref={bar}
      className="editor-edit-bar column-action-bar"
      role="toolbar"
      aria-label={`${label} tools`}
      data-editor-chrome
      data-dock={phone ? "keyboard" : "float"}
    >
      <strong>{label}</strong>
      <button type="button" onClick={onStyle}>
        {onAdd ? "Style" : "Layout"}
      </button>
      <button type="button" onClick={() => clipboard.copy(itemKey)}>
        Copy style
      </button>
      <span className="style-paste-button" title={pasteTitle}>
        <button
          type="button"
          disabled={!hasStyle}
          title={pasteTitle}
          onClick={() => clipboard.paste(itemKey)}
        >
          Paste style
        </button>
      </span>
      {onAdd && (
        <button
          type="button"
          aria-label={`Add block to ${label.toLowerCase()}`}
          onClick={(event) => onAdd(event.currentTarget)}
        >
          Add block
        </button>
      )}
      {!onAdd && onUnwrap && (
        <button type="button" onClick={onUnwrap}>
          Unwrap
        </button>
      )}
      <button
        type="button"
        ref={trigger}
        aria-label={`More ${label.toLowerCase()} actions`}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {more && (
        <ToolbarPopover
          trigger={trigger.current}
          close={() => setMore(false)}
          className="block-action-menu column-action-menu"
        >
          <div
            role="menu"
            aria-label={`${label} actions`}
            className="column-action-menu-items"
          >
            <button
              type="button"
              role="menuitem"
              onClick={command(() => clipboard.copy(itemKey))}
            >
              Copy style <kbd>{mac ? "⌥⌘C" : "Ctrl+Alt+C"}</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!hasStyle}
              title={pasteTitle}
              onClick={command(() => clipboard.paste(itemKey))}
            >
              Paste style <kbd>{mac ? "⌥⌘V" : "Ctrl+Alt+V"}</kbd>
            </button>
            {group && (
              <button
                type="button"
                role="menuitem"
                onClick={command(() => clipboard.pasteAll(group, itemKey))}
              >
                Apply this style to all columns
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={command(() => clipboard.reset(itemKey))}
            >
              {group ? "Reset column style" : "Reset group style"}
            </button>
            {(onLayout || onUnwrap || onDelete) && <hr />}
            {onLayout && (
              <button type="button" role="menuitem" onClick={command(onLayout)}>
                Columns layout…
              </button>
            )}
            {onUnwrap && (
              <button type="button" role="menuitem" onClick={command(onUnwrap)}>
                Unwrap columns
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={command(onDelete)}
              >
                Delete columns
              </button>
            )}
            {tools && (
              <BlockActionPresentation.Provider value="menu">
                <div onClick={() => setMore(false)}>{tools}</div>
              </BlockActionPresentation.Provider>
            )}
          </div>
        </ToolbarPopover>
      )}
    </div>
  );
}
