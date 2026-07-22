"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function JoinGamePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z0-9-]{3,12}$/.test(code)) {
      setError("Use the room code from your DM.");
      return;
    }
    router.push(`/join/${code}`);
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-panel">
        <Link href="/" className="back-link">
          Start
        </Link>
        <div>
          <span className="product-kicker">Player Join</span>
          <h1>Enter the room code.</h1>
          <p>Your DM creates the room and gives you the join code.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Room code
            <input
              autoFocus
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="A1B2C3"
              maxLength={12}
            />
          </label>
          <button className="primary-action" disabled={!roomCode.trim()} type="submit">
            Join game
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
