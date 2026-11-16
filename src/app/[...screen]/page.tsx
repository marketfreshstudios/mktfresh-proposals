import { staffMetadata, staffPageName } from "../../lib/staff-brand";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ screen: string[] }>;
}) {
  const { screen } = await params;
  return screen[0] === "billing" && screen[1]
    ? { title: "Billing setup" }
    : staffMetadata(staffPageName(screen));
}
import { redirect } from "next/navigation";
import { legacyStaffRedirect, type StaffQuery } from "../../lib/staff-routes";
import { StaffApp } from "../../components/staff-app";
import { FindWorkspace } from "../../components/find-workspace";
import { cookies, headers } from "next/headers";
import { databaseAddresses, signInHost } from "../../lib/workspace-host";
import {
  REMEMBERED_WORKSPACE_COOKIE,
  validWorkspaceSlug,
} from "../../lib/workspace-address";
import { workspaceOrigin } from "../../lib/links";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string[] }>;
  searchParams: Promise<StaffQuery>;
}) {
  const { screen } = await params;
  const query = await searchParams;
  if (
    screen[0] === "studio" &&
    screen[1] === "connections" &&
    query.view === "reference"
  )
    redirect("/studio/workspace?view=pricing-references");
  if (
    screen[0] === "studio" &&
    screen[1] === "connections" &&
    screen.length === 2 &&
    (query.view === "qbo" || query.view === "stripe")
  )
    redirect(
      "/studio/connections/" + (query.view === "qbo" ? "quickbooks" : "stripe"),
    );
  const destination = legacyStaffRedirect(screen);
  if (destination) redirect(destination);
  if (screen[0] === "login" && screen.length === 1) {
    const host = await signInHost((await headers()).get("host"));
    if (host.find) {
      const last = (await cookies()).get(REMEMBERED_WORKSPACE_COOKIE)?.value;
      const remembered =
        last &&
        validWorkspaceSlug(last) &&
        (await databaseAddresses.idForSlug(last).catch(() => null))
          ? workspaceOrigin(last)
          : null;
      return <FindWorkspace remembered={remembered} unknown={host.unknown} />;
    }
  }
  return (
    <StaffApp
      path={screen}
      query={query}
      local={
        process.env.APP_MODE === "local" &&
        process.env.NODE_ENV !== "production" &&
        !process.env.VERCEL
      }
    />
  );
}
