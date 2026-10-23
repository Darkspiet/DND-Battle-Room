import Link from "next/link";
import { getSiteName } from "../lib/siteConfig";

export default function HomePage() {
  return (
    <main className="app-shell start-shell">
      <section className="start-hero">
        <div className="start-copy">
          <h1>{getSiteName()}</h1>
          <p>
            A focused tabletop command room for encounter maps, initiative, shared dice, and reusable combat pieces.
          </p>
          <div className="start-feature-list" aria-label="Battle room capabilities">
            <span>Saved DM rooms</span>
            <span>Live table sync</span>
            <span>Map build tools</span>
          </div>
        </div>
        <div className="start-actions" aria-label="Start options">
          <Link className="start-card dm-card" href="/dm/login">
            <span>DM Gate</span>
            <strong>Open DM Profile</strong>
            <small>Sign in with username and password to manage rooms, profiles, and shared presets.</small>
          </Link>
          <Link className="start-card player-card" href="/join">
            <span>Player Entry</span>
            <strong>Join by Code</strong>
            <small>Use a room code, add your name, and upload an optional picture.</small>
          </Link>
        </div>
      </section>
    </main>
  );
}
