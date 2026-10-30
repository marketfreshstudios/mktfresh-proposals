export type StaffQuery = Record<string, string | string[] | undefined>;
export const studioRoutes = [
  ["/studio/templates", "Templates & blocks"],
  ["/studio/catalog", "Catalog"],
  ["/studio/connections", "Connections"],
  ["/studio/workspace", "Workspace"],
  ["/studio/activity", "Activity log"],
] as const;
export function legacyStaffRedirect(path: string[]) {
  const [section, id, action] = path;
  if (section === "dashboard") return "/";
  if (section === "proposals" && id === "new") return "/proposals?new=1";
  if (section === "proposals" && id && action) {
    if (action === "edit") return `/proposals/${id}`;
    if (action === "send") return `/proposals/${id}?view=send`;
    if (action === "countersign") return `/proposals/${id}?action=countersign`;
    if (action === "audit") return `/proposals/${id}?view=evidence`;
  }
  if (section === "archives")
    return id ? `/proposals/${id}?view=archive` : "/proposals?view=archived";
  const root: Record<string, string> = {
    catalogue: "/studio/catalog",
    assistants: "/studio/connections?view=assistants",
    library: "/studio/templates?view=blocks",
    integrations: "/studio/connections",
    imports: "/studio/connections?view=imports",
  };
  if (root[section]) return root[section];
  if (section === "templates")
    return "/studio/templates" + (id ? "/" + path.slice(1).join("/") : "");
  if (section === "settings")
    return id === "ai"
      ? "/studio/connections?view=assistants"
      : id === "team"
        ? "/studio/workspace?view=team"
        : "/studio/workspace";
  return null;
}
export function staffRoute(path: string[], query: StaffQuery = {}) {
  let [section = "", id, action] = path;
  if (section === "studio") {
    const mapping: Record<string, string> = {
      templates: query.view === "blocks" ? "library" : "templates",
      catalog: "catalogue",
      connections:
        query.view === "assistants"
          ? "assistants"
          : query.view === "imports"
            ? "imports"
            : "integrations",
      workspace: query.view === "team" ? "team" : "settings",
      activity: "activity",
    };
    section = id ? (mapping[id] ?? "missing") : "studio";
    id = path[2];
    action = path[3];
    if (section === "team") {
      section = "settings";
      id = "team";
    }
    if (section === "assistants") {
      section = "settings";
      id = "ai";
    }
  }
  if (section === "proposals" && id)
    action =
      query.action === "countersign"
        ? "countersign"
        : query.view === "send"
          ? "send"
          : query.view === "evidence"
            ? "audit"
            : action;
  return { section, id, action };
}
