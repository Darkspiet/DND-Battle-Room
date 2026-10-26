"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "../lib/client/api";

export function DMInvitations() {
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function generate() {
    setPending(true); setError(""); setCopied(false);
    try {
      setInvite(await apiFetch("/api/v1/auth/invites", { method: "POST" }));
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setPending(false); }
  }
  return <details className="dm-invitations">
    <summary>DM invitations</summary>
    <div className="stack-form">
    <h2>Invite another DM</h2>
    <p>Share a single-use code privately. They can choose Sign up on the DM sign-in page and create their own account.</p>
    <button className="button secondary-button" disabled={pending} onClick={() => void generate()} type="button">{pending ? "Generating..." : "Generate DM invitation"}</button>
    {invite ? <>
      <label>DM invitation code<input readOnly value={invite.code} onFocus={(event) => event.target.select()} /></label>
      <small>Expires {new Date(invite.expiresAt).toLocaleString()}. Copy this code now; it cannot be retrieved after leaving this page.</small>
      <button className="button secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(invite.code).then(() => setCopied(true)).catch(() => setError("Select the code and copy it manually."))}>{copied ? "Copied" : "Copy invitation code"}</button>
    </> : null}
    {error ? <p className="form-message error" role="alert">{error}</p> : null}
    </div>
  </details>;
}
