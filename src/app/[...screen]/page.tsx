import { StaffApp } from "../../components/staff-app";
export default async function Page({
  params,
}: {
  params: Promise<{ screen: string[] }>;
}) {
  const { screen } = await params;
  return (
    <StaffApp
      path={screen}
      local={
        process.env.APP_MODE === "local" &&
        process.env.NODE_ENV !== "production" &&
        !process.env.VERCEL
      }
    />
  );
}
