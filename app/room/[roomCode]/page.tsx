import { redirect } from "next/navigation";

export default async function LegacyRoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  redirect(`/play/${(await params).roomCode.toUpperCase()}`);
}
