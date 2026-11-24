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
import { Login, StaffApp } from "../../components/staff-app";
import { SignInContinue } from "../../components/find-workspace";
import { headers } from "next/headers";
import { signInHost } from "../../lib/workspace-host";
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
  if (screen[0] === "login" && screen[1] === "continue" && screen.length === 2)
    return <SignInContinue />;
  if (screen[0] === "login" && screen.length === 1) {
    const host = await signInHost((await headers()).get("host"));
    if (host.find)
      return (
        <Login
          local={false}
          appHost
          unknown={host.unknown}
          initialState={query.state}
        />
      );
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
