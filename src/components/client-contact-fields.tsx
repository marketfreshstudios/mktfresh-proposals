"use client";
import { useId, useState } from "react";
import { AsYouType, getCountries } from "libphonenumber-js/max";
import {
  countryName,
  countryCode,
  formattedPhone,
  normalizedPhone,
} from "../lib/client-contact";
import type { Client } from "../lib/model";
import { Field } from "./ui";
export function PhoneField({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(formattedPhone(initial)),
    [error, setError] = useState("");
  const id = useId();
  function validate(input: HTMLInputElement) {
    try {
      normalizedPhone(input.value);
      input.setCustomValidity("");
      setError("");
    } catch (e) {
      const message = (e as Error).message;
      input.setCustomValidity(message);
      setError(message);
    }
  }
  return (
    <Field label="Phone">
      <input
        aria-label="Phone"
        type="tel"
        name="phone"
        autoComplete="tel"
        value={value}
        aria-invalid={!!error}
        aria-describedby={error ? id : undefined}
        onChange={(e) => {
          const input = e.currentTarget;
          let next = input.value;
          const caret = input.selectionStart ?? next.length;
          if (
            (e.nativeEvent as InputEvent).inputType ===
              "deleteContentBackward" &&
            next.replace(/\D/g, "") === value.replace(/\D/g, "")
          )
            next =
              next.slice(0, caret).replace(/\d\D*$/, "") + next.slice(caret);
          const digits = next.slice(0, caret).replace(/\D/g, "").length;
          const formatted = /^[+\d()\s.-]*$/.test(next)
            ? new AsYouType("US").input(next)
            : next;
          setValue(formatted);
          try {
            normalizedPhone(formatted);
            input.setCustomValidity("");
          } catch (e) {
            input.setCustomValidity((e as Error).message);
          }
          setError("");
          requestAnimationFrame(() => {
            let pos = 0,
              seen = 0;
            while (pos < formatted.length && seen < digits)
              if (/\d/.test(formatted[pos++])) seen++;
            input.setSelectionRange(pos, pos);
          });
        }}
        onBlur={(e) => validate(e.currentTarget)}
        onInvalid={(e) => validate(e.currentTarget)}
      />
      {error && (
        <small id={id} role="alert">
          {error}
        </small>
      )}
    </Field>
  );
}
export function ClientContactFields({ client }: { client?: Client }) {
  const [addressOpen, setAddressOpen] = useState(
    !!client &&
      Object.entries(client.address).some(([k, v]) => k !== "country" && !!v),
  );
  return (
    <>
      <div className="client-fields">
        {[
          ["first_name", "First name"],
          ["last_name", "Last name"],
          ["title", "Title"],
          ["email", "Email"],
          ["company", "Company"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              type={key === "email" ? "email" : "text"}
              required={["email", "company"].includes(key)}
              defaultValue={String(client?.[key as keyof Client] ?? "")}
              maxLength={
                key === "email" ? 254 : key.endsWith("name") ? 100 : 200
              }
            />
          </Field>
        ))}
        <PhoneField initial={client?.phone} />
      </div>
      <button
        type="button"
        className="text-action"
        aria-expanded={addressOpen}
        onClick={() => setAddressOpen(!addressOpen)}
      >
        {addressOpen ? "Hide address" : "Add address"}
      </button>
      <div className="client-fields" hidden={!addressOpen}>
        {[
          ["line1", "Address line 1"],
          ["line2", "Address line 2"],
          ["city", "City"],
          ["region", "State / region"],
          ["postal_code", "Postal code"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={`address.${key}`}
              defaultValue={client?.address[key] ?? ""}
              maxLength={200}
            />
          </Field>
        ))}
        <Field label="Country">
          <select
            aria-label="Country"
            name="address.country"
            defaultValue={countryCode(client?.address.country || "US")}
          >
            {getCountries()
              .toSorted((a, b) => countryName(a).localeCompare(countryName(b)))
              .map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </>
  );
}
export function clientFormValues(
  form: HTMLFormElement,
): Record<string, unknown> & { address: Record<string, FormDataEntryValue> } {
  const values = Object.fromEntries(new FormData(form));
  const address = Object.fromEntries(
    Object.entries(values)
      .filter(([k]) => k.startsWith("address."))
      .map(([k, v]) => [k.slice(8), v]),
  );
  return {
    ...Object.fromEntries(
      Object.entries(values).filter(([k]) => !k.startsWith("address.")),
    ),
    address,
  };
}
