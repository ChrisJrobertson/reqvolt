import { ApprovePageClient } from "./approve-page-client";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ApprovePageClient token={token} />;
}
