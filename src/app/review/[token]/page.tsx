import { ReviewPageClient } from "./review-page-client";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ReviewPageClient token={token} />;
}
