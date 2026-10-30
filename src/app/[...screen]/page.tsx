import { redirect } from "next/navigation";
import { legacyStaffRedirect, type StaffQuery } from "../../lib/staff-routes";
import { StaffApp } from "../../components/staff-app";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string[] }>;
  searchParams: Promise<StaffQuery>;
}) {
  const { screen } = await params;
  const destination = legacyStaffRedirect(screen);
  if (destination) redirect(destination);
  return (
    <StaffApp
      path={screen}
      query={await searchParams}
      local={
        process.env.APP_MODE === "local" &&
        process.env.NODE_ENV !== "production" &&
        !process.env.VERCEL
      }
    />
  );
}
