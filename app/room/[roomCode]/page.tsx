import { Tabletop } from "../../../components/Tabletop";

export default async function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;

  return <Tabletop roomCode={roomCode.toUpperCase()} />;
}
