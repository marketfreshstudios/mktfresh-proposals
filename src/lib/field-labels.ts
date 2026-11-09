import { oiotPlan } from "../../seed/oiot-plan";
export const fieldLabels: Record<string, string> = {
  "client.first_name": "Client first name",
  "client.last_name": "Client last name",
  "client.full_name": "Client full name",
  "client.company": "Client company",
  "client.title": "Client title",
  "client.email": "Client email",
  "client.phone": "Client phone",
  "client.address": "Client address",
  "proposal.title": "Proposal title",
  "proposal.date": "Proposal date",
  "proposal.valid_until": "Valid until",
  "proposal.validity": "Validity sentence",
  "sender.name": "Sender name",
  "sender.email": "Sender email",
  "workspace.name": "Workspace name",
  "workspace.state": "Business state",
  "company.name": "Company name",
  "company.owner": "Company owner",
  "company.email": "Company email",
  "company.phone": "Company phone",
  "company.address": "Company address",
  "quote.one_time_total": "One-time total",
  "quote.monthly_total": "Monthly total",
  "quote.yearly_total": "Yearly total",
  "quote.selected_items": "Selected products",
  "oiot.kickoff": oiotPlan.kickoffLabel,
  "oiot.purchase_price": "Website purchase price",
};
export const fieldLabel = (path: string) =>
  fieldLabels[path] ??
  path
    .replace(/^quote\.item\./, "Product ")
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const fieldGroup = (path: string) =>
  path.startsWith("client.")
    ? "Client"
    : path.startsWith("proposal.")
      ? "Proposal"
      : path.startsWith("quote.") || path.startsWith("oiot.")
        ? "Totals"
        : "Sender & workspace";
