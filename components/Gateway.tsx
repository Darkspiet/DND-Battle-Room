"use client";

import { ArrowRight, Dices, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function Gateway({ siteName = "DND Battle Room" }: { siteName?: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{8}$/.test(normalized)) {
      setError("Enter the 8-character campaign code from your DM.");
      return;
    }
    router.push(`/join/${normalized}`);
  }

  return (
    <main className="gateway">
      <div className="gateway-shade" />
      <header className="gateway-header">
        <Link className="brand" href="/" aria-label={`${siteName} home`}>
          <span className="brand-mark"><Dices aria-hidden="true" /></span>
          <span>{siteName}</span>
        </Link>
        <Link className="button ghost-button" href="/dm/login">
          <ShieldCheck aria-hidden="true" />
          DM sign in
        </Link>
      </header>

      <section className="gateway-content" aria-labelledby="gateway-title">
        <p className="eyebrow">Self-hosted campaign command</p>
        <h1 id="gateway-title">{siteName}</h1>
        <p className="gateway-lede">Enter your campaign once. Your DM controls whether you arrive at the world map or the active encounter.</p>

        <form className="join-command" onSubmit={join}>
          <label htmlFor="campaign-code">Campaign code</label>
          <div className="join-command-row">
            <input
              id="campaign-code"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              inputMode="text"
              maxLength={8}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""));
                setError("");
              }}
              placeholder="ABCD2345"
              value={code}
            />
            <button className="button primary-button" type="submit">
              Enter
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <p className={error ? "form-message error" : "form-message"} aria-live="polite">
            {error || "No player account or email required."}
          </p>
        </form>
      </section>
    </main>
  );
}
