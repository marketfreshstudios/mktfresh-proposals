"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Lock } from "lucide-react";

/** What the server returns to start entering a different card. */
export type CardSetup = {
  client_secret: string;
  publishable_key: string;
  stripe_account?: string;
};
export type NewCardHandle = {
  /** Confirms the card with Stripe; resolves to the SetupIntent id. */
  confirm(): Promise<string>;
};

type StripeElement = {
  mount(node: HTMLElement): void;
  on(
    event: "ready" | "change",
    handler: (e: { complete?: boolean }) => void,
  ): void;
  destroy(): void;
};
type StripeElements = {
  create(kind: "payment", options: Record<string, unknown>): StripeElement;
};
type StripeJs = {
  elements(options: Record<string, unknown>): StripeElements;
  confirmSetup(options: {
    elements: StripeElements;
    redirect: "if_required";
    confirmParams?: Record<string, unknown>;
  }): Promise<{
    error?: { message?: string };
    setupIntent?: { id: string; status: string };
  }>;
};
declare global {
  interface Window {
    Stripe?: (key: string, options?: { stripeAccount?: string }) => StripeJs;
  }
}

let loading: Promise<void> | undefined;
/** Stripe.js must load from Stripe itself; it is never bundled. */
function loadStripe() {
  if (window.Stripe) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Stripe's fields live in their own frame, so the theme is passed as plain
 * colors read from the page (a canvas pixel turns any CSS color into hex). */
function themeColor(node: HTMLElement, name: string, fallback: string) {
  const value = getComputedStyle(node).getPropertyValue(name).trim();
  if (!value) return fallback;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function isDark(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

export const NewCardForm = forwardRef<
  NewCardHandle,
  {
    approvalId: string;
    start: (approvalId: string) => Promise<CardSetup>;
    /** A decline from the charge itself, shown under the fields. */
    error?: string;
    onReady?: (ready: boolean) => void;
  }
>(function NewCardForm(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const stripe = useRef<{ js: StripeJs; elements: StripeElements }>(undefined);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [cardError, setCardError] = useState("");
  const { approvalId, start, onReady } = props;

  useEffect(() => {
    let live = true;
    let element: StripeElement | undefined;
    onReady?.(false);
    (async () => {
      try {
        const setup = await start(approvalId);
        await loadStripe();
        if (!live || !host.current || !window.Stripe) return;
        const js = window.Stripe(
          setup.publishable_key,
          setup.stripe_account ? { stripeAccount: setup.stripe_account } : {},
        );
        const node = host.current;
        const background = themeColor(node, "--surface-sunken", "#ffffff");
        const elements = js.elements({
          clientSecret: setup.client_secret,
          appearance: {
            theme: isDark(background) ? "night" : "stripe",
            variables: {
              colorPrimary: themeColor(node, "--accent", "#335a47"),
              colorBackground: background,
              colorText: themeColor(node, "--ink", "#12151a"),
              colorTextSecondary: themeColor(node, "--ink-muted", "#5f666d"),
              colorDanger: themeColor(node, "--danger", "#b42318"),
              borderRadius: "10px",
              fontFamily: getComputedStyle(node).fontFamily,
            },
            rules: {
              ".Input": {
                borderColor: themeColor(node, "--border-strong", "#c9cdd1"),
                boxShadow: "none",
              },
            },
          },
        });
        element = elements.create("payment", {
          layout: "tabs",
          wallets: { applePay: "never", googlePay: "never" },
        });
        element.on("ready", () => {
          if (!live) return;
          setState("ready");
          onReady?.(true);
        });
        element.on("change", () => setCardError(""));
        element.mount(node);
        stripe.current = { js, elements };
      } catch {
        if (live) setState("failed");
      }
    })();
    return () => {
      live = false;
      element?.destroy();
      stripe.current = undefined;
    };
  }, [approvalId, start, onReady]);

  useImperativeHandle(ref, () => ({
    async confirm() {
      const s = stripe.current;
      if (!s || state !== "ready")
        throw new Error("The card form is still loading. Try again.");
      const result = await s.js.confirmSetup({
        elements: s.elements,
        redirect: "if_required",
      });
      if (result.error || result.setupIntent?.status !== "succeeded") {
        const message =
          result.error?.message ??
          "That card couldn’t be saved. Try another card.";
        setCardError(message);
        throw new Error(message);
      }
      return result.setupIntent.id;
    },
  }));

  const shown = cardError || props.error;
  return (
    <div className="new-card">
      {state === "loading" && (
        <p className="new-card-status" role="status">
          Loading the card form…
        </p>
      )}
      {state === "failed" ? (
        <p className="new-card-error" role="alert">
          The card form couldn’t load. Check your connection and try again.
        </p>
      ) : (
        <div ref={host} className="new-card-fields" />
      )}
      {shown && (
        <p className="new-card-error" role="alert">
          {shown}
        </p>
      )}
      <p className="new-card-secure">
        <Lock size={14} aria-hidden="true" />
        Secured by Stripe. This card is used only for this service.
      </p>
    </div>
  );
});
