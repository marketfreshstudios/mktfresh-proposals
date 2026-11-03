"use client";
import { useEffect, useRef, useState } from "react";
import { useHistoryStatus } from "../editor-history";
import { ToolbarPopover } from "../toolbar-popover";
import { EditorIcon } from "./editor-icon";
/** Retains the same history handlers; phone commands live in the More menu. */
export function TemplateHistoryControls() {
  const history = useHistoryStatus();
  const [mac, setMac] = useState(false),
    [phone, setPhone] = useState(false),
    [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const media = matchMedia("(max-width:699px)");
    const update = () => {
      setPhone(media.matches);
      setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const commands = [
    {
      name: "Undo",
      icon: "undo" as const,
      title: mac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)",
      disabled: !history.canUndo,
      run: () => history.controller?.undo(),
    },
    {
      name: "Redo",
      icon: "redo" as const,
      title: mac ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Shift+Z)",
      disabled: !history.canRedo,
      run: () => history.controller?.redo(),
    },
  ];
  if (phone)
    return (
      <div className="template-history-phone" data-editor-chrome>
        <button
          type="button"
          ref={trigger}
          aria-label="More template actions"
          title="More"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ⋯
        </button>
        {open && (
          <ToolbarPopover
            trigger={trigger.current}
            className="phone-editor-menu template-history-menu"
            close={() => setOpen(false)}
          >
            <div role="menu" aria-label="Template actions">
              {commands.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="menuitem"
                  aria-label={c.name}
                  title={c.title}
                  disabled={c.disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    c.run();
                  }}
                >
                  <EditorIcon name={c.icon} />
                  {c.name}
                </button>
              ))}
            </div>
          </ToolbarPopover>
        )}
      </div>
    );
  return (
    <div
      className="template-history-controls"
      data-editor-chrome
      role="toolbar"
      aria-label="Template history"
    >
      {commands.map((c) => (
        <button
          key={c.name}
          type="button"
          aria-label={c.name}
          title={c.title}
          disabled={c.disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={c.run}
        >
          <EditorIcon name={c.icon} />
        </button>
      ))}
    </div>
  );
}
