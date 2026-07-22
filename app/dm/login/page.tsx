"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hasSupabaseConfig } from "../../../lib/supabaseRoom";
import { createDMAccount, getCurrentDMUser, signInDM } from "../../../lib/dmData";
import { saveGuestProfile } from "../../../lib/storage";
import { prepareTokenImage } from "../../../lib/tokenImages";

const PROFILE_COLORS = ["#b7394b", "#227447", "#2563eb", "#7c3aed", "#8a5a10", "#151b23"];

export default function DMLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Mira Stone");
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarName, setAvatarName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hasSupabase = hasSupabaseConfig();

  useEffect(() => {
    if (!hasSupabase) {
      setLoading(false);
      return;
    }
    getCurrentDMUser().then((user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      saveGuestProfile({ id: user.id, nickname: user.name, color: user.color, avatarUrl: user.avatarUrl, avatarName: user.avatarName });
      router.replace("/dm/dashboard");
    }).catch(() => setLoading(false));
  }, [hasSupabase, router]);

  async function handleAvatar(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setError("");
      setAvatarUrl(image.imageUrl);
      setAvatarName(image.imageName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that profile image.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setSubmitting(true);
    try {
      const result =
        mode === "signin"
          ? await signInDM(username, password)
          : await createDMAccount({ username, password, name, color, avatarUrl: avatarUrl || undefined, avatarName: avatarName || undefined });

      if (result.needsEmailConfirmation) {
        setStatus("Confirm the generated DM account email in Supabase, then sign in with this username.");
        return;
      }
      if (!result.user) {
        setError("Could not open that DM profile.");
        return;
      }
      saveGuestProfile({
        id: result.user.id,
        nickname: result.user.name,
        color: result.user.color,
        avatarUrl: result.user.avatarUrl,
        avatarName: result.user.avatarName
      });
      router.push("/dm/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in as DM.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-shell auth-shell dm-auth-shell">
      <section className="auth-panel dm-auth-panel">
        <div className="panel-heading">
          <Link href="/" className="back-link">
            Start
          </Link>
          <span className="sync-badge">DM profile</span>
        </div>
        <div className="auth-title-row">
          <div>
            <h1>Enter the DM sanctum.</h1>
            <p>Use a username and password to unlock saved rooms, profile identity, and the shared encounter library.</p>
          </div>
          <div className="dm-profile-mark" style={{ borderColor: color }}>
            {avatarUrl ? <img alt="" src={avatarUrl} /> : <span>{(name || username || "DM").slice(0, 1).toUpperCase()}</span>}
          </div>
        </div>

        {!hasSupabase ? (
          <p className="sync-warning">
            Using the local DM database for this device. Add Supabase env vars and apply <code>supabase/schema.sql</code> when you want hosted accounts.
          </p>
        ) : null}

        <div className="mode-tabs" aria-label="Auth mode">
          <button className={mode === "signin" ? "selected" : ""} onClick={() => setMode("signin")} type="button">
            Sign in
          </button>
          <button className={mode === "signup" ? "selected" : ""} onClick={() => setMode("signup")} type="button">
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              placeholder="mira.stone"
              maxLength={32}
              required
            />
          </label>
          {mode === "signup" ? (
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
            </label>
          ) : null}
          <label>
            Password
            <input
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              minLength={4}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {mode === "signup" ? (
            <>
              <div>
                <span className="field-label">Profile color</span>
                <div className="color-picker" aria-label="Choose DM profile color">
                  {PROFILE_COLORS.map((candidate) => (
                    <button
                      aria-label={`Use ${candidate}`}
                      className={candidate === color ? "selected" : ""}
                      key={candidate}
                      onClick={() => setColor(candidate)}
                      style={{ background: candidate }}
                      type="button"
                    />
                  ))}
                </div>
              </div>
              <label>
                Optional profile image
                <input accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleAvatar(event.target.files?.[0] ?? null)} type="file" />
              </label>
              {avatarUrl ? (
                <div className="token-preview">
                  <img alt="" src={avatarUrl} />
                  <div>
                    <strong>{avatarName || "DM profile image"}</strong>
                    <button className="secondary-action compact" onClick={() => { setAvatarUrl(""); setAvatarName(""); }} type="button">
                      Remove image
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <button className="primary-action" disabled={submitting || loading} type="submit">
            {submitting ? "Opening profile..." : mode === "signin" ? "Sign in as DM" : "Create DM profile"}
          </button>
        </form>

        {status ? <p className="empty-state">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
