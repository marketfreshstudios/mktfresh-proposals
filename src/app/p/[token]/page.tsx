import { ClientProposal } from "../../../components/client-proposal";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  return (
    <ClientProposal
      token={(await params).token}
      preview={preview === "1" || preview === "published"}
      publishedPreview={preview === "published"}
    />
  );
}
