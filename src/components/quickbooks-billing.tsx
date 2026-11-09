"use client";

import { useEffect, useId, useState } from "react";
import type { BillingLink, Proposal } from "../lib/model";
import {
  proposalInvoiceRef,
  qboBillingEmail,
  quickBooksCustomerReview,
} from "../lib/qbo-mapping";
import { useMoney } from "./money-context";
import { api, Button, post } from "./ui";

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
  const radioName = useId();
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
    display_name?: string;
    email: string;
  }[];
  const review = quickBooksCustomerReview(link);
  const canCreate =
    link.metadata?.customer_review_reason === "name" ||
    link.metadata?.customer_review_reason === "company";
  const reconnect =
    /connect.*quickbooks/i.test(link.last_error ?? "") ||
    /connect.*quickbooks/i.test(details?.refresh_error ?? "");
  const run = async (choice: string | null) => {
    setBusy(true);
    setError("");
    try {
      await post(endpoint, { customer: choice });
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="quickbooks-billing">
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
        <div className="quickbooks-invoice">
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
        <a href="/studio/connections/quickbooks">Reconnect QuickBooks</a>
      )}
      {review && (
        <>
          <fieldset className="quickbooks-customer-choices" disabled={busy}>
            <legend>Choose a QuickBooks customer</legend>
            <div className="quickbooks-customer-options">
              {candidates.map((c) => (
                <label className="quickbooks-customer" key={c.id}>
                  <input
                    type="radio"
                    name={radioName}
                    value={c.id}
                    checked={customer === c.id}
                    onChange={() => setCustomer(c.id)}
                  />
                  <span>
                    <strong>{c.display_name || c.company}</strong>
                    {c.company &&
                      c.company !== c.display_name &&
                      c.display_name && <span>{c.company}</span>}
                    <span>{c.email || "No email on file"}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="quickbooks-customer-actions">
            <Button
              disabled={!candidates.some((c) => c.id === customer) || busy}
              onClick={() => void run(customer)}
            >
              Use this customer
            </Button>
            {canCreate && (
              <Button disabled={busy} onClick={() => void run(null)}>
                Create new customer
              </Button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
