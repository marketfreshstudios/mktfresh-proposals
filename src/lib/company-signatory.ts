import { PDFDocument } from "pdf-lib";
import { canonical, sha256 } from "./content";
import { check, CounterSignatureSchema, type Actor } from "./model";
import { onBehalfText, type WorkspaceSettings } from "./workspace";
export function signatoryVersion(settings?: WorkspaceSettings | null) {
  return sha256(
    canonical({
      company: settings?.company_name,
      signatory: settings?.company_signatory ?? null,
    }),
  );
}
export async function validateSignatureImage(image: string) {
  check(
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) &&
      image.length <= 500000,
    "PNG signature required",
  );
  try {
    const pdf = await PDFDocument.create();
    const png = await pdf.embedPng(Buffer.from(image.split(",")[1], "base64"));
    check(
      png.width <= 4096 && png.height <= 4096,
      "Signature image is too large",
    );
  } catch {
    throw new Error(
      "Valid PNG signature required (maximum 4096 pixels per side)",
    );
  }
}
export async function companySignature(
  raw: unknown,
  actor: Actor,
  settings: WorkspaceSettings,
) {
  check(actor.actor.startsWith("staff:"), "Staff authorization required", 403);
  const input = CounterSignatureSchema.parse(raw),
    s = settings.company_signatory;
  check(
    s?.user_id && s.image,
    "An owner must configure the company signatory and stored signature first",
  );
  const id = actor.actor.slice(6);
  check(
    s.authorized_user_ids.includes(id),
    "You are not authorized to apply the company signature",
    403,
  );
  check(actor.staff_email, "Authenticated staff email required", 403);
  check(
    input.signatory_version === signatoryVersion(settings),
    "Company signatory changed; reload before signing",
    409,
  );
  const delegated = id !== s.user_id;
  const text = onBehalfText(s.name, settings.company_name);
  check(
    !delegated ||
      (input.authorization === true && input.authorization_text === text),
    "Confirm the exact authorization to sign on behalf of the company signatory",
    400,
  );
  await validateSignatureImage(s.image);
  return {
    input,
    signature: {
      name: s.name,
      title: s.title,
      email: s.email,
      kind: "drawn" as const,
      image: s.image,
      company: settings.company_name,
      signatory_user_id: s.user_id,
      applied_by: {
        user_id: id,
        name: actor.staff_name || actor.staff_email,
        email: actor.staff_email,
      },
      authorization_text: delegated ? text : undefined,
      application_statement: `Company signature applied by ${actor.staff_name || actor.staff_email} [${actor.staff_email}] on behalf of ${s.name}`,
    },
  };
}
