"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getGuestProfile, saveGuestProfile } from "../../../lib/storage";
import { prepareTokenImage } from "../../../lib/tokenImages";

export default function PlayerProfilePage() {
  const router = useRouter();
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode.toUpperCase();
  const [nickname, setNickname] = useState("Adventurer");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarName, setAvatarName] = useState("");
  const [roomStatus, setRoomStatus] = useState<"checking" | "open" | "missing">("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    const profile = getGuestProfile();
    setNickname(profile.nickname);
    setAvatarUrl(profile.avatarUrl ?? "");
    setAvatarName(profile.avatarName ?? "");

    fetch(`/api/rooms/${roomCode}/status`)
      .then(async response => setRoomStatus(response.ok && (await response.json()).exists ? "open" : "missing"))
      .catch(() => setRoomStatus("missing"));
  }, [roomCode]);

  async function handleAvatar(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setError("");
      setAvatarUrl(image.imageUrl);
      setAvatarName(image.imageName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that picture.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (roomStatus !== "open") {
      setError("That room is not open yet. Ask the DM to open the room first.");
      return;
    }
    try {
      const response = await fetch(`/api/rooms/${roomCode}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:nickname.trim()||'Adventurer',avatarUrl:avatarUrl||undefined,avatarName:avatarName||undefined})});
      const data = await response.json();
      if(!response.ok) throw new Error(data.error||'Could not join room.');
      saveGuestProfile(data.profile);
    } catch(error) { setError(error instanceof Error?error.message:'Could not join room.'); return; }
    router.push(`/room/${roomCode}`);
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-panel">
        <Link href="/join" className="back-link">
          Join
        </Link>
        <div>
          <span className="product-kicker">Room {roomCode}</span>
          <h1>Set your table profile.</h1>
          <p>Your name and optional picture will be shown to the DM and other players.</p>
        </div>
        {roomStatus === "checking" ? <p className="empty-state">Checking that the room is open...</p> : null}
        {roomStatus === "missing" ? (
          <p className="sync-warning">This room is not open on the server yet. Ask the DM to open it, then try again.</p>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <label>
            Player name
            <input disabled={roomStatus !== "open"} value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={28} />
          </label>
          <label>
            Optional picture
            <input disabled={roomStatus !== "open"} accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleAvatar(event.target.files?.[0] ?? null)} type="file" />
          </label>
          {avatarUrl ? (
            <div className="token-preview">
              <img alt="" src={avatarUrl} />
              <div>
                <strong>{avatarName || "Player picture"}</strong>
                <button className="secondary-action compact" onClick={() => { setAvatarUrl(""); setAvatarName(""); }} type="button">
                  Remove picture
                </button>
              </div>
            </div>
          ) : null}
          <button className="primary-action" disabled={roomStatus !== "open"} type="submit">
            Enter lobby
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
