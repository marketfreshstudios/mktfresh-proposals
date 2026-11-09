import type { MouseEventHandler } from "react";

export function ProviderMark({ provider }: { provider: "stripe" | "qbo" }) {
  return (
    <span
      className="connection-monogram provider-mark"
      data-provider-mark={provider}
      aria-hidden="true"
    >
      <img
        src={
          provider === "stripe"
            ? "/providers/stripe-mark.svg"
            : "/providers/quickbooks-mark.svg"
        }
        alt=""
      />
    </span>
  );
}

export function QuickBooksConnectButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      className="quickbooks-connect-button"
      type="button"
      aria-label="Connect to QuickBooks"
      disabled={disabled}
      onClick={onClick}
    >
      <img
        src="/providers/quickbooks-connect-default.svg"
        width={223}
        height={36}
        alt=""
      />
      <img
        src="/providers/quickbooks-connect-hover.svg"
        width={223}
        height={36}
        alt=""
      />
    </button>
  );
}
