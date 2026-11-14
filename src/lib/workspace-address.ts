// A workspace's address is {slug}.{WORKSPACE_DOMAIN}. Without WORKSPACE_DOMAIN
// every workspace uses the deployment's APP_URL, as before.
const SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
// Names the product needs for itself, or that could pass for it.
export const RESERVED_WORKSPACE_ADDRESSES = new Set([
  "admin", "api", "app", "assets", "auth", "billing", "blog", "cdn", "dashboard",
  "dev", "docs", "help", "login", "mail", "mx", "ns1", "ns2", "pay", "preview",
  "privacy", "security", "signup", "smtp", "staging", "start", "static",
  "status", "support", "terms", "test", "www", "yeswell",
]);
export function validWorkspaceSlug(value: string) {
  return (
    SLUG.test(value) &&
    !value.includes("--") &&
    !RESERVED_WORKSPACE_ADDRESSES.has(value)
  );
}
export function workspaceDomain() {
  const domain = process.env.WORKSPACE_DOMAIN?.trim().toLowerCase();
  return domain && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(domain)
    ? domain
    : null;
}
export function workspaceSlugFromHost(host: string | null | undefined) {
  const domain = workspaceDomain();
  if (!domain || !host) return null;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!name.endsWith("." + domain)) return null;
  const label = name.slice(0, -domain.length - 1);
  return validWorkspaceSlug(label) ? label : null;
}
export function requestHost(request: Request) {
  return request.headers.get("host") ?? new URL(request.url).host;
}
