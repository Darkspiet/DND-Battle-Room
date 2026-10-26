import { PlayerJoin } from "../../../components/PlayerJoin";

export default async function PlayerJoinPage({ params }: { params: Promise<{ roomCode: string }> }) {
  return <PlayerJoin code={(await params).roomCode.toUpperCase()} />;
}
