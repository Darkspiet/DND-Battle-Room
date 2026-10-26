"use client";

import { ArrowLeft, Dices, KeyRound, LogIn, RotateCcwKey, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../lib/client/api";
import type { DMUser } from "../lib/domain/types";

const COLORS = ["#b83c52", "#2f7f62", "#3f72af", "#a66b32", "#7a5aa6", "#d3b45e"];

export function DMAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [inviteRequired, setInviteRequired] = useState(true);
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", resetCode: "", inviteCode: "", color: COLORS[0] });

  useEffect(() => {
    void apiFetch<{ inviteRequired: boolean }>("/api/v1/auth/signup")
      .then((policy) => { setInviteRequired(policy.inviteRequired); setPolicyLoaded(true); })
      .catch(() => setError("Could not load signup settings. Reload the page to try again."));
    void apiFetch<{ user: DMUser | null }>("/api/v1/auth/session")
      .then(({ user }) => { if (user) router.replace("/dm/dashboard"); })
      .catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const path = mode === "signin" ? "/api/v1/auth/signin" : mode === "signup" ? "/api/v1/auth/signup" : "/api/v1/auth/reset";
      const body = mode === "signin"
        ? { username: form.username, password: form.password }
        : mode === "signup"
          ? form
          : { resetCode: form.resetCode, password: form.password };
      await apiFetch<{ user?: DMUser; ok?: boolean }>(path, { method: "POST", body: JSON.stringify(body) });
      if (mode === "reset") {
        setStatus("Password updated. Sign in with the new password.");
        setMode("signin");
        setForm((current) => ({ ...current, password: "", resetCode: "" }));
        return;
      }
      router.push("/dm/dashboard");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-visual" aria-label="Campaign map artwork">
        <Link className="brand light" href="/">
          <span className="brand-mark"><Dices aria-hidden="true" /></span>
          <span>DND Battle Room</span>
        </Link>
        <div className="auth-visual-copy">
          <p className="eyebrow">Dungeon Master access</p>
          <h1>Run the whole campaign from one command room.</h1>
        </div>
      </section>

      <section className="auth-workspace">
        <Link className="text-link" href="/"><ArrowLeft aria-hidden="true" /> Back</Link>
        <div className="auth-heading">
          <span className="section-icon"><KeyRound aria-hidden="true" /></span>
          <h2>{mode === "signin" ? "Sign in as DM" : mode === "signup" ? "Create a DM account" : "Reset password"}</h2>
          <p>{mode === "signin" ? "Use your home-server account." : mode === "signup" ? (inviteRequired ? "Ask an existing DM for an invitation code to create your account." : "Create your account to prepare and run campaigns.") : "Enter the one-time reset code from the server operator."}</p>
        </div>

        <div className="segmented" aria-label="Authentication mode">
          <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")} type="button"><LogIn aria-hidden="true" /> Sign in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button"><UserPlus aria-hidden="true" /> Sign up</button>
          <button className={mode === "reset" ? "active" : ""} onClick={() => setMode("reset")} type="button"><RotateCcwKey aria-hidden="true" /> Reset</button>
        </div>

        <form className="stack-form" onSubmit={submit}>
          {mode === "signup" ? (
            <>
              {inviteRequired ? <label>DM invitation code<input autoComplete="off" maxLength={128} required value={form.inviteCode} onChange={(event) => setForm({ ...form, inviteCode: event.target.value })} /><small>Single-use code from an existing DM; expires after 72 hours.</small></label> : null}
              <label>Display name<input maxLength={48} required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
            </>
          ) : null}
          {mode === "reset" ? <label>Reset code<input autoComplete="off" required value={form.resetCode} onChange={(event) => setForm({ ...form, resetCode: event.target.value })} /></label> : <label>Username<input autoComplete="username" minLength={3} maxLength={32} required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} /></label>}
          <label>{mode === "reset" ? "New password" : "Password"}<input autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signin" ? 1 : 12} maxLength={128} required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {mode === "signup" ? (
            <fieldset className="swatch-field">
              <legend>Profile color</legend>
              <div className="swatches">
                {COLORS.map((color) => <button aria-label={`Use color ${color}`} className={form.color === color ? "selected" : ""} key={color} onClick={() => setForm({ ...form, color })} style={{ backgroundColor: color }} type="button" />)}
              </div>
            </fieldset>
          ) : null}
          <button className="button primary-button wide" disabled={pending || (mode === "signup" && !policyLoaded)} type="submit">
            {mode === "signin" ? <LogIn aria-hidden="true" /> : mode === "signup" ? <UserPlus aria-hidden="true" /> : <RotateCcwKey aria-hidden="true" />}
            {pending ? "Working..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create DM account" : "Set new password"}
          </button>
          {status ? <p className="form-message">{status}</p> : null}
          {error ? <p className="form-message error" role="alert">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
