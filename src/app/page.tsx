import { staffMetadata } from "../lib/staff-brand";
export const metadata = staffMetadata("Home");
import { StaffApp } from "../components/staff-app";
import type { StaffQuery } from "../lib/staff-routes";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<StaffQuery>;
}) {
  return <StaffApp path={[]} query={await searchParams} />;
}
