import { formatMoney, type CentsMode } from "../lib/money";
export function DocumentTotals({
  oneTime,
  monthly,
  yearly,
  currency,
  cents = "auto",
  className = "",
}: {
  oneTime: number;
  monthly: number;
  yearly?: number;
  currency: string;
  cents?: CentsMode;
  className?: string;
}) {
  return (
    <div
      className={`document-totals ${className}`}
      aria-label="Proposal totals"
      data-print-unit="quote-totals"
    >
      {(
        [
          ["One-time", oneTime, ""],
          ["Monthly", monthly, "/mo"],
          ...(yearly === undefined ? [] : [["Yearly", yearly, "/yr"]]),
        ] as [string, number, string][]
      ).map(([label, amount, suffix]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>
            {formatMoney(amount, currency, cents)}
            {suffix && <small>{suffix}</small>}
          </strong>
        </div>
      ))}
    </div>
  );
}
