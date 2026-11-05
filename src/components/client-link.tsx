"use client";
import { DialogActions } from "./dialog-actions";
import { useEffect, useState } from "react";
import type { Proposal } from "../lib/model";
import { Button, Field } from "./ui";
import { Sheet } from "./foundation";
export function CopyClientLink({
  token,
  appUrl,
  menu = false,
  label = "Copy link",
}: {
  token: string;
  appUrl: string;
  menu?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const url = new URL(`/p/${token}`, appUrl).href;
  useEffect(() => {
    setCopied(false);
    setError("");
  }, [url]);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError("");
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  };
  if (menu)
    return (
      <>
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : label}
        </button>
        {error && (
          <p role="alert">
            {error}
            <input
              aria-label="Client link"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </p>
        )}
      </>
    );
  return (
    <div className="client-link-control">
      <Field label="Client link">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <Button onClick={() => void copy()}>{copied ? "Copied" : label}</Button>
      {copied && (
        <span className="sr-only" role="status">
          Copied
        </span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ManualDeliveryConfirmation({
  p,
  appUrl,
  onClose,
}: {
  p: Proposal;
  appUrl: string;
  onClose(): void;
}) {
  return (
    <Sheet title="Your proposal link is ready" onClose={onClose}>
      <div className="stack manual-delivery-confirmation">
        <p>
          Paste this into your own email. The client signs and pays on this page
          as usual.
        </p>
        <CopyClientLink token={p.token!} appUrl={appUrl} label="Copy" />
        {p.password_hash && <p>They'll also need the password you set.</p>}
        <DialogActions>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </div>
    </Sheet>
  );
}
