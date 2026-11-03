"use client";
import { useEffect, useState } from "react";
import { useHistoryStatus } from "../editor-history";
import { EditorIcon } from "./editor-icon";
/** Template-only header placement; uses the existing session history controller. */
export function TemplateHistoryControls() {
  const history = useHistoryStatus();
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <div
      className="template-history-controls"
      data-editor-chrome
      role="toolbar"
      aria-label="Template history"
    >
      <button
        type="button"
        aria-label="Undo"
        title={mac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
        disabled={!history.canUndo}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => history.controller?.undo()}
      >
        <EditorIcon name="undo" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title={mac ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Shift+Z)"}
        disabled={!history.canRedo}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => history.controller?.redo()}
      >
        <EditorIcon name="redo" />
      </button>
    </div>
  );
}
