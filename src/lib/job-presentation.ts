import type { Job } from "./model";
export type JobFailure = {
  job_id: string;
  name: string;
  summary: string;
  error: string;
  details?: string;
};
export function jobName(
  job: Pick<Job, "kind" | "payload">,
  providers: string[] = [],
) {
  if (job.kind === "pdf")
    return job.payload.stage === "company"
      ? "Signed PDF and certificate"
      : "Client-signed PDF";
  if (job.kind === "email") return "Email delivery";
  if (job.kind === "stripe_webhook") return "Stripe billing";
  if (job.payload.provider === "qbo") return "QuickBooks invoice";
  if (job.payload.provider === "stripe") return "Stripe billing";
  return providers.length === 1
    ? providers[0] === "qbo"
      ? "QuickBooks invoice"
      : "Stripe billing"
    : "Stripe billing and QuickBooks invoice";
}
export function friendlyJobError(error: string): {
  message: string;
  details?: string;
} {
  if (
    /Page\.printToPDF.*Printing failed|page\.pdf:.*Printing failed/i.test(error)
  )
    return {
      message:
        "Chromium could not print the document. Retry the PDF job from the proposal record.",
    };
  if (/Invalid PDF print geometry:/i.test(error))
    return {
      message:
        "The document has invalid print dimensions. Check the page settings before retrying.",
      details: error,
    };
  if (/Invoice manually/i.test(error))
    return {
      message:
        "Create the one-time invoice manually, then record it on the proposal.",
    };
  if (
    /missing renderer package|Cannot find module|Failed to load external module/i.test(
      error,
    )
  )
    return {
      message:
        "The PDF renderer is unavailable. The application deployment needs attention.",
      details: error,
    };
  return {
    message:
      "Review the details below, then retry or resolve the job on the proposal record.",
    details: error,
  };
}
export function jobFailure(
  job: Job,
  error: string,
  providers: string[] = [],
): JobFailure {
  const name = jobName(job, providers),
    friendly = friendlyJobError(error);
  return {
    job_id: job.id,
    name,
    summary: `${name} could not finish. ${friendly.message}`,
    error,
    ...(friendly.details ? { details: friendly.details } : {}),
  };
}
export function jobRecordAnchor(id: string) {
  return `job-${encodeURIComponent(id)}`;
}
