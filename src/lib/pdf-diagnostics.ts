import { readFileSync } from "node:fs";
export type PrintDiagnostic = {
  stage: "client" | "company" | "preview";
  print: "proposal body" | "certificate";
  attempt: number;
  page_count: number;
  geometry: unknown;
  memory: {
    rss: number;
    heap_used: number;
    external: number;
    chromium_rss: number | null;
  };
  chromium: string;
  console: string[];
  stderr: string[];
  error: string;
  at: string;
};
export const diagnosticText = (s: string) =>
  s
    .replace(/data:[^\s"<>]+/g, "[embedded data]")
    .replace(/https?:\/\/[^\s"<>]+/g, "[url]")
    .slice(-600);
export class PdfPrintError extends Error {
  constructor(
    message: string,
    public pdf_diagnostics: PrintDiagnostic[],
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
export function printMemory(pid?: number): PrintDiagnostic["memory"] {
  const m = process.memoryUsage();
  let rss: number | null = null;
  try {
    const s = readFileSync(`/proc/${pid}/status`, "utf8").match(
      /^VmRSS:\s+(\d+) kB/m,
    );
    if (s) rss = Number(s[1]) * 1024;
  } catch {}
  return {
    rss: m.rss,
    heap_used: m.heapUsed,
    external: m.external,
    chromium_rss: rss,
  };
}
export function shortPrintDiagnostics(values: PrintDiagnostic[]) {
  return values.slice(-3).map((d) => ({
    ...d,
    error: diagnosticText(d.error).slice(-300),
    console: d.console.slice(-3).map((s) => diagnosticText(s).slice(-180)),
    stderr: d.stderr.slice(-3).map((s) => diagnosticText(s).slice(-180)),
  }));
}
