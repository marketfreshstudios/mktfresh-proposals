"use client";
import { useEffect, useState } from "react";
import { formattedPhone } from "../lib/client-contact";
import { Icon } from "./ui";
const noticeEvent = "contact-copy-notice";
export function ContactToast() {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (e: Event) => {
      setNotice((e as CustomEvent).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 3000);
    };
    window.addEventListener(noticeEvent, show);
    return () => {
      window.removeEventListener(noticeEvent, show);
      clearTimeout(timer);
    };
  }, []);
  return notice ? (
    <div className="contact-toast" role={notice.error ? "alert" : "status"}>
      {notice.text}
    </div>
  ) : null;
}
export function ContactValue({
  kind,
  value,
}: {
  kind: "email" | "phone";
  value: string;
}) {
  const shown = kind === "phone" ? formattedPhone(value) : value;
  const href = `${kind === "email" ? "mailto" : "tel"}:${value}`;
  return (
    <span
      className={`contact-value inner-action contact-${kind}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="contact-copy"
        aria-label={`Copy ${kind} ${shown}`}
        onClick={() => void copyContactValue(shown)}
      >
        {shown}
      </button>
      {kind === "phone" && (
        <a className="phone-dial" href={href}>
          {shown}
        </a>
      )}
      <button
        type="button"
        className="contact-open contact-copy-icon"
        aria-label={`Copy ${kind}: ${shown}`}
        title={`Copy ${kind}`}
        onClick={() => void copyContactValue(shown)}
      >
        <Icon name="copy" />
      </button>
      <a
        className="contact-open"
        href={href}
        aria-label={`${kind === "email" ? "Open in Mail" : "Dial phone"}: ${shown}`}
        title={kind === "email" ? "Open in Mail" : "Dial phone"}
      >
        <Icon name={kind === "email" ? "mail" : "phone"} />
        <span className="sr-only">
          {kind === "email" ? "Open in Mail" : "Dial phone"}
        </span>
      </a>
    </span>
  );
}

export async function copyContactValue(shown: string) {
  try {
    await navigator.clipboard.writeText(shown);
    window.dispatchEvent(
      new CustomEvent(noticeEvent, {
        detail: { text: "Copied", error: false },
      }),
    );
  } catch {
    window.dispatchEvent(
      new CustomEvent(noticeEvent, {
        detail: {
          text: "Couldn’t copy. Select the text and copy it manually.",
          error: true,
        },
      }),
    );
  }
}
