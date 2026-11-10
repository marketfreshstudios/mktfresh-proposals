import { z } from "zod";
export const businessStates = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
] as const;
export const BusinessStateSchema = z
  .object({
    name: z.enum([...businessStates, "other", ""]),
    other: z.string().trim().max(200).default(""),
  })
  .strict();
export function businessState(
  settings?: {
    business_state?: z.infer<typeof BusinessStateSchema>;
  } | null,
) {
  const value = settings?.business_state;
  return value?.name === "other" ? value.other.trim() : (value?.name ?? "");
}
export const businessDetailsUrl = "/studio/workspace?view=business-details";
export const businessStateError = "Add your business state";
export const businessStateUrl = `${businessDetailsUrl}#workspace-business-state`;
