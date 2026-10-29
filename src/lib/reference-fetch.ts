import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { AppError } from "./model";

export const REFERENCE_LIMIT = 1024 * 1024;
export const REFERENCE_TIMEOUT = 15000;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export function referenceUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "Use a valid HTTPS reference URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new AppError(
      400,
      "Use an HTTPS URL without embedded credentials or a fragment",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    (isIP(host) && !publicAddress(host))
  )
    throw new AppError(400, "Reference URL must use a public address");
  return url;
}
export type ReferenceFetchOptions = {
  credentials?: { username: string; password: string };
  resolve?: typeof lookup;
  request?: typeof request;
  timeout?: number;
};
/** DNS answers are validated and pinned into the socket lookup to prevent rebinding. */
export async function fetchReference(
  value: string,
  options: ReferenceFetchOptions = {},
): Promise<string> {
  const initial = referenceUrl(value);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Reference fetch timed out"));
    }, options.timeout ?? REFERENCE_TIMEOUT);
  });
  async function fetchUrl(url: URL, redirects: number): Promise<string> {
    if (controller.signal.aborted) throw new Error("Reference fetch timed out");
    referenceUrl(url.href);
    if (url.origin !== initial.origin)
      throw new Error("Reference redirect must stay on the same host and port");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await (options.resolve ?? lookup)(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error("Reference host must resolve only to public addresses");
    if (controller.signal.aborted) throw new Error("Reference fetch timed out");
    return new Promise((resolve, reject) => {
      const pinned = addresses[0];
      const req = (options.request ?? request)(
        url,
        {
          signal: controller.signal,
          agent: false,
          headers: {
            Accept: "text/plain, text/markdown, application/json",
            "Accept-Encoding": "identity",
            ...(options.credentials
              ? {
                  Authorization:
                    "Basic " +
                    Buffer.from(
                      options.credentials.username +
                        ":" +
                        options.credentials.password,
                    ).toString("base64"),
                }
              : {}),
          },
          lookup: (_hostname, opts, callback) => {
            if ((opts as { all?: boolean }).all)
              (callback as any)(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if ([301, 302, 303, 307, 308].includes(status)) {
            response.resume();
            if (!response.headers.location || redirects >= 3) {
              reject(new Error("Reference redirect limit exceeded"));
              return;
            }
            let next: URL;
            try {
              next = new URL(response.headers.location, url);
            } catch {
              reject(new Error("Invalid reference redirect"));
              return;
            }
            void fetchUrl(next, redirects + 1).then(resolve, reject);
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(new Error(`Reference fetch failed (HTTP ${status})`));
            return;
          }
          if (
            response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity"
          ) {
            response.destroy();
            reject(new Error("Compressed references are not supported"));
            return;
          }
          if (Number(response.headers["content-length"]) > REFERENCE_LIMIT) {
            response.destroy();
            reject(new Error("Reference exceeds the 1 MB limit"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > REFERENCE_LIMIT) {
              response.destroy();
              reject(new Error("Reference exceeds the 1 MB limit"));
            } else chunks.push(chunk);
          });
          response.on("end", () => {
            try {
              resolve(
                new TextDecoder("utf-8", { fatal: true }).decode(
                  Buffer.concat(chunks),
                ),
              );
            } catch {
              reject(new Error("Reference must be UTF-8 text"));
            }
          });
          response.on("error", () =>
            reject(new Error("Reference response interrupted")),
          );
          response.on("aborted", () =>
            reject(new Error("Reference response interrupted")),
          );
        },
      );
      req.on("error", () =>
        reject(
          new Error(
            controller.signal.aborted
              ? "Reference fetch timed out"
              : "Reference connection failed",
          ),
        ),
      );
      req.end();
    });
  }
  try {
    return await Promise.race([fetchUrl(initial, 0), timeout]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
