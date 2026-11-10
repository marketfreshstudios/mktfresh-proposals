import { businessState } from "./business-state";
import type { WorkspaceSettings } from "./workspace";

export function workspaceBusinessName(settings?: WorkspaceSettings | null) {
  return settings?.business_name?.trim() || settings?.company_name || "";
}

export function workspaceBusinessAddress(settings: WorkspaceSettings) {
  if (settings.business_address) return settings.business_address;
  const lines = settings.address.trim().split(/\r?\n/);
  const locality = lines
    .at(-1)
    ?.match(/^(.+),\s*(?:[A-Z]{2}|[A-Za-z ]+)\s+(\d{5}(?:-\d{4})?)$/);
  if (!locality || lines.length < 2)
    return { street: settings.address, line2: "", city: "", zip: "" };
  const [street, ...rest] = lines.slice(0, -1);
  return {
    street,
    line2: rest.join(", "),
    city: locality[1],
    zip: locality[2],
  };
}

export function formattedBusinessAddress(settings: WorkspaceSettings) {
  if (!settings.business_address) return settings.address;
  const { street, line2, city, zip } = settings.business_address;
  const state = businessState(settings);
  return [
    street,
    line2,
    [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

export function businessDetailsSnapshot(settings: WorkspaceSettings) {
  const {
    business_name,
    business_address,
    business_website,
    business_state,
    company_name,
    phone,
    address,
  } = settings;
  return {
    business_name,
    business_address,
    business_website,
    business_state,
    company_name,
    phone,
    address,
  };
}
