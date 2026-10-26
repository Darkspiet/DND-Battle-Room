import { CampaignWorkspace } from "../../../../components/campaign/CampaignWorkspace";

export default async function CampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  return <CampaignWorkspace campaignId={(await params).campaignId} />;
}
