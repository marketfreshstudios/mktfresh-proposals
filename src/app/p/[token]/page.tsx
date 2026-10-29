import { ClientProposal } from "../../../components/client-proposal";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  return (
    <ClientProposal
      token={(await params).token}
      preview={(await searchParams).preview === "1"}
    />
  );
}
