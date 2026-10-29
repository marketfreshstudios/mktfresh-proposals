import { ClientProposal } from "../../../components/client-proposal";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <ClientProposal token={(await params).token} />;
}
