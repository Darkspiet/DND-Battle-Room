import { PlayerCampaign } from "../../../components/campaign/PlayerCampaign";

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  return <PlayerCampaign code={(await params).code.toUpperCase()} />;
}
