"use client";

import { useState } from "react";
import { DialogActions } from "./dialog-actions";
import { Banner, Button, Field, post } from "./ui";

export type BillingCategory = { id: string; name: string; active: boolean };

/**
 * A billing category is the Stripe product that custom recurring prices are
 * billed under (stored as a custom family). One category serves many
 * proposals; each proposal sets its own amount.
 */
export function BillingCategoryForm({
  onCreated,
  close,
}: {
  onCreated: (category: BillingCategory) => void | Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const name = String(new FormData(e.currentTarget).get("name") ?? "");
        setError("");
        setBusy(true);
        try {
          const category = await post<BillingCategory>("/api/custom-families", {
            name,
            request_id: requestId,
          });
          await onCreated(category);
          close();
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Unable to save. Try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Name it for the kind of service, such as Custom care. Custom monthly or
        yearly prices are billed under it in Stripe, and each proposal sets its
        own amount. Existing Stripe products are checked for duplicates.
      </p>
      <Field label="Category name">
        <input name="name" minLength={3} maxLength={100} required />
      </Field>
      {error && (
        <Banner tone="danger" title="Your changes are still here">
          {`${error} Correct the issue and try again.`}
        </Banner>
      )}
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Create in Stripe test mode
        </Button>
      </DialogActions>
    </form>
  );
}
