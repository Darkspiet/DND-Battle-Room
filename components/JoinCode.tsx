"use client";

import { ArrowLeft, ArrowRight, Dices } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function JoinCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[A-Z2-9]{8}$/.test(code)) return setError("Enter the 8-character code from your DM.");
    router.push(`/join/${code}`);
  }

  return (
    <main className="player-join-page">
      <div className="player-join-backdrop" />
      <header><Link className="brand light" href="/"><span className="brand-mark"><Dices aria-hidden="true" /></span><span>DND Battle Room</span></Link></header>
      <section className="player-join-panel">
        <Link className="text-link" href="/"><ArrowLeft aria-hidden="true" /> Home</Link>
        <p className="eyebrow">Player entry</p><h1>Enter campaign code</h1>
        <form className="stack-form" onSubmit={submit}><label>Campaign code<input autoCapitalize="characters" autoFocus maxLength={8} placeholder="ABCD2345" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "")); setError(""); }} /></label><button className="button primary-button wide" type="submit">Continue <ArrowRight aria-hidden="true" /></button>{error ? <p className="form-message error">{error}</p> : null}</form>
      </section>
    </main>
  );
}
