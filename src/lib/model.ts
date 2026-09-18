import { z } from "zod";
export const ClientSchema = z.object({
  id: z.string().uuid(),
  company: z.string().min(1).max(200),
  first_name: z.string().max(100),
  last_name: z.string().max(100),
  email: z.email(),
  phone: z.string().max(80).default(""),
  address: z.record(z.string(), z.string()).default({}),
  notes: z.string().max(10000).default(""),
  qbo_customer_id: z.string().nullable().default(null),
  stripe_customer_id: z.string().nullable().default(null),
});
export type Client = z.infer<typeof ClientSchema>;
export const ItemSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  unit_price: z.number().int().min(0).max(100000000),
  billing: z.enum(["one_time", "monthly"]),
  qbo_item_id: z.string().nullable().default(null),
  stripe_price_id: z.string().nullable().default(null),
  active: z.boolean().default(true),
});
export type Item = z.infer<typeof ItemSchema>;
export const LineSchema = ItemSchema.extend({
  qty: z.number().int().min(1).max(10000),
  optional: z.boolean(),
  selected: z.boolean(),
});
export type Line = z.infer<typeof LineSchema>;
export type Block = {
  type:
    | "heading"
    | "paragraph"
    | "image"
    | "pricing_table"
    | "signature_block"
    | "page_break"
    | "variable";
  text?: string;
  content?: RichText;
  src?: string;
  alt?: string;
  role?: "client" | "company";
  path?: string;
};
export type RichText = {
  type: string;
  text?: string;
  content?: RichText[];
  marks?: { type: string }[];
};
export type Template = {
  id: string;
  name: string;
  content: Block[];
  default_quote: {
    pricing_item_id: string;
    qty: number;
    optional: boolean;
    selected: boolean;
  }[];
  active: boolean;
};
export const SignatureSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email(),
    title: z.string().max(200).default(""),
    consent: z.literal(true),
    kind: z.enum(["typed", "drawn"]),
    typed_name: z.string().trim().max(200).optional(),
    image: z.string().max(500000).optional(),
    revision: z.number().int().nonnegative(),
  })
  .superRefine((v, c) => {
    if (v.kind === "typed" && !v.typed_name)
      c.addIssue({ code: "custom", message: "Typed name required" });
    if (
      v.kind === "drawn" &&
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.image ?? "")
    )
      c.addIssue({ code: "custom", message: "PNG signature required" });
  });
export type SignatureInput = z.infer<typeof SignatureSchema>;
export type Actor = { actor: string; ip: string; user_agent: string };
export type Signer = Omit<SignatureInput, "consent" | "revision"> &
  Actor & {
    role: "client" | "company";
    signed_at: string;
    consent_text: string;
    consent_at: string;
    signature_image_path?: string;
  };
export type Audit = Actor & {
  id: string;
  type: string;
  created_at: string;
  metadata: Record<string, unknown>;
};
export type Version = {
  id: string;
  version_no: number;
  content: Block[];
  quote: Line[];
  variables_resolved: Record<string, string>;
  content_hash: string;
  created_at: string;
  frozen: boolean;
};
export type FileRecord = {
  id: string;
  kind: "render" | "sealed" | "import" | "signature";
  storage_path: string;
  sha256: string;
  bytes: number;
  created_at: string;
  body_sha256?: string;
  version_hash?: string;
  stage?: string;
};
export type BillingLink = {
  provider: "qbo" | "stripe";
  status: "pending" | "succeeded" | "failed" | "needs_review";
  external_customer_id?: string;
  external_object_id?: string;
  last_error?: string;
  attempts: number;
  metadata?: Record<string, unknown>;
};
export type Job = {
  id: string;
  kind: "email" | "pdf" | "billing";
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  available_at: string;
  lease_until?: string;
  last_error?: string;
};
export type Proposal = {
  id: string;
  revision: number;
  client: Client;
  template_id: string | null;
  title: string;
  status:
    | "draft"
    | "sent"
    | "viewed"
    | "signed_by_client"
    | "completed"
    | "declined"
    | "expired"
    | "archived";
  token: string | null;
  password_hash: string | null;
  valid_until: string;
  currency: string;
  source: "native" | "proposify_import";
  proposify_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  client_signed_at: string | null;
  completed_at: string | null;
  content: Block[];
  quote: Line[];
  versions: Version[];
  signers: Signer[];
  events: Audit[];
  files: FileRecord[];
  billing_links: BillingLink[];
  jobs: Job[];
  search_text: string;
  oiot?: { full_price: number; kickoff: number; pages: number };
};
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
