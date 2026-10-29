// Proposal & E-Sign System — component types.
// Documentation only; nothing here is type-checked at build time.
// Everything is exposed on `window.ProposalDS`.

import type { ReactNode, ChangeEvent, CSSProperties } from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

/** Proposal lifecycle. `aiDraft` is orthogonal — show it *beside* a status, never instead of one. */
export type ProposalStatus =
  | "draft" | "sent" | "viewed" | "signed" | "completed"
  | "declined" | "expired" | "archived" | "aiDraft";

/** Background work: PDF sealing, email, accounting sync, subscription setup. */
export type JobStateName = "queued" | "running" | "failed" | "review";

/** Semantic icon names. Add new ones from Font Awesome Free Solid only. */
export type IconName =
  | "edit" | "send" | "viewed" | "signature" | "countersign" | "verified"
  | "declined" | "expired" | "archive" | "lock" | "clock" | "running"
  | "failed" | "review" | "stale" | "retry" | "ai" | "recurring" | "one-time"
  | "download" | "pdf" | "document" | "link" | "copy" | "search" | "plus"
  | "check" | "chevron-right" | "close" | "more" | "image" | "page-break" | "variable";

export interface IconProps {
  name: IconName;
  /** Height in px. Width follows the glyph's own aspect ratio. Default 16. */
  size?: number;
  /** Supply only for a meaningful icon; otherwise it renders aria-hidden. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element | null;

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** `lg` on any client page; `xl` for Accept & sign and the billing hand-off. */
  size?: "sm" | "md" | "lg" | "xl";
  block?: boolean;
  icon?: IconName;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  /** Renders under the button. Required whenever `disabled` is set — say why. */
  note?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
}
export declare function Button(props: ButtonProps): JSX.Element;

export interface StatusPillProps {
  status: ProposalStatus;
  /** `imported` adds the read-only Proposify badge beside the pill. */
  source?: "native" | "imported";
  /** Overrides the fixed vocabulary word. Reserve for genuine exceptions. */
  label?: string;
  title?: string;
  className?: string;
}
export declare function StatusPill(props: StatusPillProps): JSX.Element | null;

export interface JobStateProps {
  state: JobStateName;
  /** What the job is, in the consumer's words: "Create QuickBooks invoice". */
  label: string;
  /** The provider's safe message. Never a stack trace, token or key. */
  error?: string;
  attempts?: number;
  /** Supply for failed and review states; the control renders beside the state. */
  onRetry?: () => void;
  className?: string;
}
export declare function JobState(props: JobStateProps): JSX.Element | null;

export interface TotalsPairProps {
  oneTime: number;
  monthly: number;
  currency?: string;
  /** `lg` in the sticky bar and record header. */
  size?: "sm" | "md" | "lg";
  layout?: "row" | "stack";
  oneTimeNote?: string;
  monthlyNote?: string;
  className?: string;
}
/** Both figures, always, side by side. There is no single-total variant on purpose. */
export declare function TotalsPair(props: TotalsPairProps): JSX.Element;

export interface QuoteLine {
  id: string;
  name: string;
  description?: string;
  /** Amount the client pays for this line, after any staff override. */
  amount: number;
  cadence: "oneTime" | "monthly";
  /** Catalog price, shown struck beside the amount when it differs. Staff surfaces only. */
  listPrice?: number;
  quantity?: number;
  /** Optional lines get a checkbox; required lines render locked. */
  optional?: boolean;
  selected?: boolean;
  minimumTerm?: number;
  /** Rendered in full as its own row: "$175.00/month for 30 months, then $100.00/month". */
  schedule?: string;
}
export interface QuoteGroup {
  title: string;
  cadence: "oneTime" | "monthly";
  lines: QuoteLine[];
}
export interface PricingTableProps {
  /** One-time and monthly are separate groups. Never interleave cadences. */
  groups: QuoteGroup[];
  currency?: string;
  /** After client signature. Locks every checkbox and dims the rows. */
  frozen?: boolean;
  onToggle?: (lineId: string) => void;
  className?: string;
}
export declare function PricingTable(props: PricingTableProps): JSX.Element;

export interface BannerProps {
  tone?: Tone;
  title?: string;
  icon?: IconName;
  /** Buttons. A blocking banner (stale revision) must carry the recovery action. */
  actions?: ReactNode;
  onDismiss?: () => void;
  children?: ReactNode;
  className?: string;
}
export declare function Banner(props: BannerProps): JSX.Element;

export interface FieldProps {
  label: string;
  name?: string;
  id?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  /** Replaces the hint. Write it as a sentence that names the fix. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  size?: "md" | "lg";
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  className?: string;
}
export declare function Field(props: FieldProps): JSX.Element;

export interface CheckboxProps {
  checked?: boolean;
  /** A required or frozen line. Renders a lock, not a disabled tick. */
  locked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  children?: ReactNode;
  className?: string;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;

export interface SignaturePadProps {
  mode?: "draw" | "type";
  onModeChange?: (mode: "draw" | "type") => void;
  typedValue?: string;
  signerName?: string;
  /** SVG path of the captured stroke, in a 480x168 viewBox. */
  strokePath?: string;
  footNote?: string;
  onClear?: () => void;
  className?: string;
}
export declare function SignaturePad(props: SignaturePadProps): JSX.Element;

export interface Column<T = any> {
  key?: string;
  header: string;
  /** Right-aligns and applies tabular figures. Use for both money columns. */
  numeric?: boolean;
  render?: (row: T) => ReactNode;
}
export interface DataTableProps<T = any> {
  columns: Column<T>[];
  rows?: T[];
  loading?: boolean;
  /** Distinguish "nothing yet" from "nothing matching" — the consumer decides which. */
  empty?: ReactNode;
  className?: string;
}
export declare function DataTable<T = any>(props: DataTableProps<T>): JSX.Element | null;

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  text?: string;
  actions?: ReactNode;
  className?: string;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;

export interface ChecklistItem {
  state: "pass" | "fail" | "warn";
  label: string;
  detail?: string;
  action?: ReactNode;
}
export interface ReadinessChecklistProps {
  /** Mirrors the server's send validation. Any `fail` blocks sending. */
  items: ChecklistItem[];
  className?: string;
}
export declare function ReadinessChecklist(props: ReadinessChecklistProps): JSX.Element;

export interface VariableChipProps {
  /** Without braces: "client.first_name". */
  name: string;
  value?: string;
  /** false renders the blocking unresolved state. */
  resolved?: boolean;
  /** Show the resolved value inline instead of the token. */
  showValue?: boolean;
}
export declare function VariableChip(props: VariableChipProps): JSX.Element;

export interface AuditEvent {
  type: string;
  actor: string;
  /** Render "Not available" rather than an empty cell in non-production. */
  ip?: string;
  revision?: number;
  at: string;
  byAI?: boolean;
}
export interface AuditTrailProps {
  events: AuditEvent[];
  className?: string;
}
export declare function AuditTrail(props: AuditTrailProps): JSX.Element;

export interface StickyActionBarProps {
  oneTime: number;
  monthly: number;
  currency?: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  /** Decline, or a link to contact the studio. */
  secondary?: ReactNode;
  className?: string;
}
/** Give the scrolling document bottom padding equal to this bar's height. */
export declare function StickyActionBar(props: StickyActionBarProps): JSX.Element;

export interface BadgeProps {
  tone?: Tone;
  icon?: IconName;
  /** "outline" is for provenance ("Proposify import"), never for state. Ignores tone. */
  variant?: "soft" | "outline";
  title?: string;
  children?: ReactNode;
  className?: string;
}
/** Free text only. A lifecycle status is StatusPill; background work is JobState. */
export declare function Badge(props: BadgeProps): JSX.Element;

export interface FilterChipProps {
  /** The field: "Status", "Client", "Sent". */
  label: string;
  /** Its current value, in words: "last 90 days", not a date range. Always visible. */
  value: string;
  active?: boolean;
  onClick?: () => void;
  /** Renders the clear control inside the chip; only shown when active. */
  onClear?: () => void;
  className?: string;
}
export declare function FilterChip(props: FilterChipProps): JSX.Element;

export interface ToolbarItem {
  id?: string;
  label?: string;
  icon?: IconName;
  /** Required for an icon-only item; used as the accessible name. */
  title?: string;
  disabled?: boolean;
  /** Renders a grouping rule instead of a button. */
  separator?: boolean;
}
export interface ToolbarProps {
  items: ToolbarItem[];
  /** Accessible name for the group. */
  label?: string;
  /** Omit for an action group; pass an item id to make it a segmented choice. */
  selected?: string | null;
  onSelect?: (id?: string) => void;
  /** "lg" for anything a client touches; the default row is below tap-min. */
  size?: "md" | "lg";
  className?: string;
}
export declare function Toolbar(props: ToolbarProps): JSX.Element;

export declare function formatMoney(amount: number, currency?: string): string;
export declare const icons: Record<IconName, { viewBox: string; d: string }>;
