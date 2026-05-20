"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient, hasSupabaseConfig } from "../../../lib/supabaseRoom";
import { getCurrentDMUser, getLocalDMUser, saveLocalDMUser } from "../../../lib/dmData";
import { saveGuestProfile } from "../../../lib/storage";

export default function DMLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Dungeon Master");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const hasSupabase = hasSupabaseConfig();

  useEffect(() => {
    getCurrentDMUser().then((user) => {
      if (!user) return;
      saveGuestProfile({ id: user.id, nickname: user.name, color: "#b7394b" });
      router.replace("/dm/dashboard");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");

    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      const user = getLocalDMUser();
      saveLocalDMUser({ ...user, name: name.trim() || "Local DM" });
      saveGuestProfile({ id: user.id, nickname: name.trim() || "Local DM", color: "#b7394b" });
      router.push("/dm/dashboard");
      return;
    }

    const credentials = { email: email.trim(), password };
    const response =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
            ...credentials,
            options: { data: { name: name.trim() || "Dungeon Master" } }
          });

    if (response.error) {
      setError(response.error.message);
      return;
    }

    if (mode === "signup" && !response.data.session) {
      setStatus("Check your email to confirm the DM account, then sign in.");
      return;
    }

    const user = response.data.user;
    if (user) {
      saveGuestProfile({
        id: user.id,
        nickname: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "Dungeon Master",
        color: "#b7394b"
      });
    }
    router.push("/dm/dashboard");
  }

  return (
    <main className="app-shell auth-shell">
      <section className="auth-panel">
        <Link href="/" className="back-link">
          Start
        </Link>
        <div>
          <span className="product-kicker">DM Account</span>
          <h1>Login as DM</h1>
          <p>Use a DM account to create saved rooms and manage the shared token and object library.</p>
        </div>

        {!hasSupabase ? (
          <p className="sync-warning">
            Supabase is not configured. This device will use a local DM profile for development.
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
          {mode === "signup" || !hasSupabase ? (
            <label>
              DM name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
            </label>
          ) : null}
          {hasSupabase ? (
            <>
              <label>
                Email
                <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                Password
                <input
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
            </>
          ) : null}
          <button className="primary-action" type="submit">
            {hasSupabase ? (mode === "signin" ? "Sign in" : "Create account") : "Continue as local DM"}
          </button>
        </form>

        {status ? <p className="empty-state">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </main>
  );
}
