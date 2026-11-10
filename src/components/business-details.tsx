"use client";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Field } from "./ui";
import { Select } from "./form-controls";
import {
  businessState,
  businessStateError,
  businessStates,
} from "../lib/business-state";
import { workspaceBusinessAddress } from "../lib/business-details";
import { normalizedPhone } from "../lib/client-contact";
import type { WorkspaceSettings } from "../lib/workspace";

const stateId = "workspace-business-state";
const stateHint = "workspace-business-state-hint";

export function BusinessDetails({
  settings,
  editable,
  change,
}: {
  settings: WorkspaceSettings;
  editable: boolean;
  change: (value: Partial<WorkspaceSettings>, immediate?: boolean) => void;
}) {
  const region = useRef<HTMLInputElement>(null);
  const state = useRef<HTMLSelectElement>(null);
  const other = settings.business_state?.name === "other";
  const [linked, setLinked] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (location.hash !== `#${stateId}`) return;
    setLinked(true);
    const field = region.current ?? state.current;
    field?.scrollIntoView({ block: "center" });
    if (editable) field?.focus({ preventScroll: true });
  }, [editable]);

  const address = workspaceBusinessAddress(settings);
  function changeAddress(key: keyof typeof address, value: string) {
    change({ business_address: { ...address, [key]: value } });
  }
  function changeState(
    value: NonNullable<WorkspaceSettings["business_state"]>,
  ) {
    change({ business_state: value }, true);
  }

  const invalid = (linked || touched) && !businessState(settings);
  return (
    <>
      <p>Manage the business information used in proposals and agreements.</p>
      {!editable && (
        <p className="muted">Only a super admin can edit business details.</p>
      )}
      <section
        className="workspace-business-group"
        aria-labelledby="business-identity"
      >
        <h3 className="t-card-title" id="business-identity">
          Business identity
        </h3>
        <div className="workspace-control-grid">
          <Field label="Legal business name">
            <input
              autoComplete="organization"
              maxLength={200}
              readOnly={!editable}
              value={settings.business_name ?? settings.company_name}
              onChange={(event) =>
                change({ business_name: event.target.value })
              }
            />
          </Field>
          <BusinessContactField
            label="Website"
            type="url"
            autoComplete="url"
            readOnly={!editable}
            maxLength={500}
            value={settings.business_website ?? ""}
            normalize={normalizeWebsite}
            onSave={(business_website) => change({ business_website }, true)}
          />
        </div>
      </section>
      <section
        className="workspace-business-group"
        aria-labelledby="business-address"
      >
        <h3 className="t-card-title" id="business-address">
          Business address
        </h3>
        <div className="workspace-control-grid">
          <Field label="Street address">
            {address.street.includes("\n") ? (
              <textarea
                autoComplete="address-line1"
                readOnly={!editable}
                maxLength={2000}
                value={address.street}
                onChange={(e) => changeAddress("street", e.target.value)}
              />
            ) : (
              <input
                autoComplete="address-line1"
                readOnly={!editable}
                maxLength={2000}
                value={address.street}
                onChange={(e) => changeAddress("street", e.target.value)}
              />
            )}
          </Field>
          <Field label="Address line 2">
            <input
              autoComplete="address-line2"
              readOnly={!editable}
              maxLength={200}
              value={address.line2}
              onChange={(e) => changeAddress("line2", e.target.value)}
            />
          </Field>
          <Field label="City">
            <input
              autoComplete="address-level2"
              readOnly={!editable}
              maxLength={200}
              value={address.city}
              onChange={(e) => changeAddress("city", e.target.value)}
            />
          </Field>
          <Field label="State (required)">
            <Select
              id={stateId}
              ref={state}
              aria-label="State (required)"
              autoComplete="address-level1"
              required
              disabled={!editable}
              aria-describedby={stateHint}
              aria-invalid={invalid && !other}
              value={settings.business_state?.name ?? ""}
              onBlur={() => setTouched(true)}
              onChange={(e) =>
                changeState({
                  name: e.target.value as NonNullable<
                    WorkspaceSettings["business_state"]
                  >["name"],
                  other: settings.business_state?.other ?? "",
                })
              }
            >
              <option value="">Choose a state</option>
              {businessStates.map((name) => (
                <option key={name}>{name}</option>
              ))}
              <option value="other">Other / outside the US</option>
            </Select>
            {!other && (
              <small id={stateHint} className={invalid ? "danger" : undefined}>
                {invalid
                  ? `${businessStateError} before sending a proposal.`
                  : "Required before you send a proposal."}
              </small>
            )}
          </Field>
          {other && (
            <Field label="State or region (required)">
              <input
                ref={region}
                aria-label="State or region (required)"
                autoComplete="address-level1"
                required
                readOnly={!editable}
                maxLength={200}
                aria-describedby={stateHint}
                aria-invalid={invalid}
                value={settings.business_state?.other ?? ""}
                onBlur={() => setTouched(true)}
                onChange={(e) =>
                  change({
                    business_state: { name: "other", other: e.target.value },
                  })
                }
              />
              <small id={stateHint} className={invalid ? "danger" : undefined}>
                {invalid
                  ? `${businessStateError} before sending a proposal.`
                  : "Required before you send a proposal."}
              </small>
            </Field>
          )}
          <Field label="ZIP / postal code">
            <input
              autoComplete="postal-code"
              readOnly={!editable}
              maxLength={40}
              value={address.zip}
              onChange={(e) => changeAddress("zip", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section
        className="workspace-business-group"
        aria-labelledby="business-contact"
      >
        <h3 className="t-card-title" id="business-contact">
          Business contact
        </h3>
        <div className="workspace-control-grid">
          <BusinessContactField
            label="Business phone"
            type="tel"
            autoComplete="tel"
            readOnly={!editable}
            maxLength={100}
            value={settings.phone}
            normalize={normalizedPhone}
            onSave={(phone) => change({ phone }, true)}
          />
        </div>
      </section>
    </>
  );
}

function normalizeWebsite(value: string) {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = new URL(/^[\w+.-]+:\/\//.test(text) ? text : `https://${text}`);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.hostname.includes(".")
    )
      return url.href;
  } catch {
    // The inline error applies to invalid URLs as well as unsupported schemes.
  }
  throw new Error(
    "Enter a valid website address, such as https://example.com.",
  );
}

function BusinessContactField({
  label,
  value,
  normalize,
  onSave,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  value: string;
  normalize: (value: string) => string;
  onSave: (value: string) => void;
}) {
  const [entry, setEntry] = useState<string | null>(null);
  const [error, setError] = useState("");
  const id =
    label === "Website" ? "workspace-website-error" : "workspace-phone-error";
  return (
    <Field label={label}>
      <input
        {...props}
        value={entry ?? value}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onChange={(e) => {
          setEntry(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onBlur={() => {
          if (entry === null) return;
          try {
            const normalized = normalize(entry);
            if (normalized !== value) onSave(normalized);
            setEntry(null);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {error && (
        <small className="danger" id={id} role="alert">
          {error}
        </small>
      )}
    </Field>
  );
}
