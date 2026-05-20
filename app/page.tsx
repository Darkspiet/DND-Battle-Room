import Link from "next/link";

export default function HomePage() {
  return (
    <main className="app-shell start-shell">
      <section className="start-hero">
        <div className="start-copy">
          <span className="product-kicker">DND Battle Room</span>
          <h1>Choose your table role.</h1>
          <p>
            DMs prepare saved rooms and reusable assets. Players enter with a code,
            set their table profile, and join the fight.
          </p>
        </div>
        <div className="start-actions" aria-label="Start options">
          <Link className="start-card dm-card" href="/dm/login">
            <span>DM</span>
            <strong>Login as DM</strong>
            <small>Create saved rooms, manage global tokens, and open build mode.</small>
          </Link>
          <Link className="start-card player-card" href="/join">
            <span>Player</span>
            <strong>Join Game</strong>
            <small>Use a room code, add your name, and upload an optional picture.</small>
          </Link>
        </div>
      </section>
    </main>
  );
}
