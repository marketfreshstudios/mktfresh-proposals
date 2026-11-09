"use client";

import { useEffect, useState } from "react";
import type { BillingLink, Proposal } from "../lib/model";
import { proposalInvoiceRef, qboBillingEmail } from "../lib/qbo-mapping";
import { useMoney } from "./money-context";
import { Select } from "./form-controls";
import { api, Button, Field, post } from "./ui";

type Invoice = {
  number: string;
  amount?: number;
  currency?: string;
  status: string;
  url: string;
};
type Details = {
  email: string;
  reference: string;
  invoice?: Invoice;
  refresh_error?: string;
};

export function QuickBooksBilling({
  proposal,
  link,
  onRefresh,
}: {
  proposal: Proposal;
  link: BillingLink;
  onRefresh: () => Promise<void>;
}) {
  const [details, setDetails] = useState<Details>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [customer, setCustomer] = useState("");
  const money = useMoney();
  const endpoint = `/api/proposals/${proposal.id}/quickbooks`;
  useEffect(() => {
    const abort = new AbortController();
    api<Details>(endpoint, { signal: abort.signal })
      .then((result) => {
        if (!abort.signal.aborted && result?.reference) setDetails(result);
      })
      .catch(() => {
        if (
          !abort.signal.aborted &&
          link.external_object_id &&
          !link.metadata?.manual_invoice
        )
          setError("QuickBooks invoice details are temporarily unavailable.");
      });
    return () => abort.abort();
  }, [endpoint, proposal.revision, link.external_object_id]);
  const invoice =
    details?.invoice ?? (link.metadata?.invoice as Invoice | undefined);
  const candidates = (link.metadata?.customer_candidates ?? []) as {
    id: string;
    company: string;
    email: string;
  }[];
  const reconnect =
    /connect.*quickbooks/i.test(link.last_error ?? "") ||
    /connect.*quickbooks/i.test(details?.refresh_error ?? "");
  const run = async (choice?: string) => {
    setBusy(true);
    setError("");
    try {
      await (choice
        ? post(endpoint, { customer: choice })
        : post(`/api/proposals/${proposal.id}/retry`));
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <p>
        Proposal reference{" "}
        {details?.reference ?? proposalInvoiceRef(proposal.id)}
      </p>
      <p>
        Invoices go to{" "}
        {details?.email ??
          String(
            link.metadata?.billing_email ?? qboBillingEmail(proposal.client),
          )}
      </p>
      {invoice && (
        <div className="stack">
          <p>
            <strong>Invoice {invoice.number}</strong> · {invoice.status}
            {invoice.amount !== undefined &&
              ` · ${money(invoice.amount, invoice.currency ?? proposal.currency)}`}
          </p>
          <a href={invoice.url} target="_blank" rel="noreferrer">
            Open in QuickBooks
          </a>
        </div>
      )}
      {details?.refresh_error && <p role="status">{details.refresh_error}</p>}
      {reconnect && (
        <a href="/studio/connections?view=qbo">Reconnect QuickBooks</a>
      )}
      {candidates.length > 0 ? (
        <>
          <Field label="Choose the QuickBooks customer">
            <Select
              value={customer}
              onChange={(event) => setCustomer(event.currentTarget.value)}
            >
              <option value="">Choose a customer</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company} · {c.email} · {c.id}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            disabled={!customer || busy}
            onClick={() => void run(customer)}
          >
            Use this customer and retry
          </Button>
        </>
      ) : (
        link.status !== "succeeded" && (
          <Button disabled={busy} onClick={() => void run()}>
            Retry QuickBooks
          </Button>
        )
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
