"use client";
import { readableDate } from "../lib/validity";
/** The cover is shared by editing and client reading. Controls do not take document space. */
export function DocumentCover({
  title,
  company,
  sender,
  validUntil,
  timezone,
  onTitle,
}: {
  title: string;
  company: string;
  sender: string;
  validUntil?: string | null;
  timezone?: string;
  onTitle?: (title: string) => void;
}) {
  return (
    <header className="document-cover">
      <p className="flow-eyebrow">Proposal for {company}</p>
      {onTitle ? (
        <h1>
          <span aria-hidden="true" className="cover-title-measure">
            {title || "\u200b"}
          </span>
          <textarea
            id="cover-title"
            aria-label="Proposal title"
            rows={1}
            maxLength={300}
            value={title}
            onChange={(e) => onTitle(e.target.value.replace(/[\r\n]+/g, " "))}
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
      <p className="flow-byline">
        From {sender}
        {validUntil && <> · Valid until {readableDate(validUntil, timezone)}</>}
      </p>
    </header>
  );
}
