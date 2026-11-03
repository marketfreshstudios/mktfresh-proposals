"use client";
import { useState, useRef } from "react";
import { ToolbarPopover } from "./toolbar-popover";
import { CoverSchema, defaultCover, type Cover } from "../lib/cover";
import { HeadingTokens } from "./editor/heading-tokens";
import { FieldTextArea } from "./field-options";
import { readableDate } from "../lib/validity";
import { useEditorHistory } from "./editor-history";
/** The cover is shared by editing and client reading. Controls do not take document space. */
export function DocumentCover({
  title,
  company,
  sender,
  validUntil,
  timezone,
  onTitle,
  workspace,
  logo,
  cover,
  map = {},
  onCover,
}: {
  cover?: Cover;
  map?: Record<string, string>;
  onCover?: (cover: Cover) => void;
  title: string;
  company: string;
  sender: string;
  validUntil?: string | null;
  timezone?: string;
  onTitle?: (title: string) => void;
  workspace?: string;
  logo?: string;
}) {
  const history = useEditorHistory();
  const logoTrigger = useRef<HTMLButtonElement>(null);
  const [logoMenu, setLogoMenu] = useState(false),
    [logoError, setLogoError] = useState("");
  const value = cover ?? {
    workspace: "{{workspace.name}}",
    eyebrow: "Proposal for {{client.company}}",
    byline: `From {{sender.name}}${validUntil ? " · Valid until {{proposal.valid_until}}" : ""}`,
  };
  const replace = (key: "workspace" | "eyebrow" | "byline", text: string) =>
    onCover?.({ ...value, [key]: text });
  const src = cover?.logo === null ? undefined : cover?.logo || logo;
  const line = (
    key: "workspace" | "eyebrow" | "byline",
    label: string,
    className: string,
  ) => (
    <p className={`${className} cover-field`} key={key}>
      {onCover ? (
        <>
          <span className="cover-field-measure">
            <HeadingTokens text={value[key] || "\u200b"} map={map} />
          </span>
          <FieldTextArea
            aria-label={label}
            rows={1}
            maxLength={key === "byline" ? 4000 : 2000}
            value={value[key]}
            onValue={(text) => replace(key, text)}
          />
        </>
      ) : (
        <HeadingTokens text={value[key]} map={map} />
      )}
    </p>
  );

  return (
    <header className="document-cover">
      <div className="cover-logo">
        {src && (
          <img
            src={src}
            alt="Company logo"
            style={{ maxHeight: 60, maxWidth: 180 }}
            onClick={onCover ? () => setLogoMenu(!logoMenu) : undefined}
          />
        )}
        {onCover && (
          <div className="cover-logo-controls" data-editor-chrome>
            <button
              type="button"
              ref={logoTrigger}
              aria-label="Edit cover logo"
              onClick={() => setLogoMenu(!logoMenu)}
            >
              {src ? "Edit logo" : "Add logo"}
            </button>
            {logoMenu && (
              <ToolbarPopover
                className="cover-logo-menu"
                trigger={logoTrigger.current}
                close={() => setLogoMenu(false)}
              >
                <label>
                  Replace logo
                  <input
                    type="file"
                    aria-label="Replace cover logo"
                    accept="image/png,image/jpeg"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 700000) {
                        setLogoError("Choose a PNG or JPEG under 700 KB");
                        return;
                      }
                      const data = await new Promise<string>((ok, bad) => {
                        const r = new FileReader();
                        r.onload = () => ok(String(r.result));
                        r.onerror = () => bad(new Error("Image unavailable"));
                        r.readAsDataURL(f);
                      }).catch(() => "");
                      const parsed = CoverSchema.safeParse({
                        ...value,
                        logo: data,
                      });
                      if (!parsed.success) {
                        setLogoError("Choose a valid PNG or JPEG image");
                        return;
                      }
                      onCover(parsed.data);
                      setLogoError("");
                      setLogoMenu(false);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    onCover({ ...value, logo: null });
                    setLogoMenu(false);
                  }}
                >
                  Remove logo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...value };
                    delete next.logo;
                    onCover(next);
                    setLogoMenu(false);
                  }}
                >
                  Use workspace logo
                </button>
                {logoError && <p role="alert">{logoError}</p>}
              </ToolbarPopover>
            )}
          </div>
        )}
      </div>
      {cover || onCover ? (
        <>
          {line("workspace", "Cover workspace name", "print-workspace")}
          {line("eyebrow", "Cover eyebrow", "flow-eyebrow")}
        </>
      ) : (
        <>
          {workspace && <p className="print-workspace">{workspace}</p>}
          <p className="flow-eyebrow">Proposal for {company}</p>
        </>
      )}
      {onTitle ? (
        <h1>
          <span aria-hidden="true" className="cover-title-measure">
            {title || "\u200b"}
          </span>
          <textarea
            data-document-text
            id="cover-title"
            aria-label="Proposal title"
            rows={1}
            maxLength={300}
            value={title}
            onChange={(e) => {
              const edit = () =>
                onTitle(e.target.value.replace(/[\r\n]+/g, " "));
              if (history) history.inScope("text:title", edit);
              else edit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </h1>
      ) : (
        <h1>{title}</h1>
      )}
      {cover || onCover ? (
        line("byline", "Cover byline", "flow-byline")
      ) : (
        <p className="flow-byline">
          From {sender}
          {validUntil && (
            <> · Valid until {readableDate(validUntil, timezone)}</>
          )}
        </p>
      )}
    </header>
  );
}
