"use client";

import { ArrowLeft, ArrowRight, Dices, ImagePlus, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../lib/client/api";

const PLAYER_COLORS = ["#d85b6a", "#2fa66d", "#4d86e8", "#d8a33d", "#9b72e8", "#22a7a7"];
const CHARACTER_ICONS = ["⚔", "🛡", "✦", "🏹", "☠", "◆"];

export function PlayerJoin({ code }: { code: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [characterIcon, setCharacterIcon] = useState(CHARACTER_ICONS[0]);
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [portraitUrl, setPortraitUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch(`/api/v1/join/${code}`)
      .then(() => router.replace(`/play/${code}`))
      .catch(() => undefined);
  }, [code, router]);

  useEffect(() => {
    if (!portrait) {
      setPortraitUrl("");
      return;
    }
    const next = URL.createObjectURL(portrait);
    setPortraitUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [portrait]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await apiFetch(`/api/v1/join/${code}`, {
        method: "POST",
        body: JSON.stringify({ nickname, color, character: { name: characterName || nickname, icon: characterIcon } })
      });
      if (portrait) {
        const form = new FormData();
        form.set("file", portrait);
        await apiFetch("/api/v1/player/avatar", { method: "POST", body: form });
      }
      router.push(`/play/${code}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="player-join-page">
      <div className="player-join-backdrop" />
      <header>
        <Link className="brand light" href="/">
          <span className="brand-mark">
            <Dices aria-hidden="true" />
          </span>
          <span>DND Battle Room</span>
        </Link>
      </header>
      <section className="player-join-panel">
        <Link className="text-link" href="/">
          <ArrowLeft aria-hidden="true" /> Campaign code
        </Link>
        <span className="section-icon large">
          <UserRound aria-hidden="true" />
        </span>
        <p className="eyebrow">Campaign {code}</p>
        <h1>Create your character</h1>
        <form className="stack-form" onSubmit={join}>
          <label>
            Player name
            <input
              autoComplete="nickname"
              autoFocus
              maxLength={40}
              minLength={2}
              required
              value={nickname}
              onChange={(event) => {
                const value = event.target.value;
                setCharacterName((current) => (!current || current === nickname ? value : current));
                setNickname(value);
              }}
            />
          </label>
          <div className="join-character-fields">
            <label>
              Character name
              <input
                maxLength={80}
                minLength={1}
                required
                value={characterName}
                onChange={(event) => setCharacterName(event.target.value)}
              />
            </label>
            <fieldset className="character-icon-field">
              <legend>Token icon</legend>
              <div className="character-icons">
                {CHARACTER_ICONS.map((icon) => (
                  <button
                    aria-label={`Use ${icon} token`}
                    className={icon === characterIcon ? "selected" : ""}
                    key={icon}
                    onClick={() => setCharacterIcon(icon)}
                    type="button"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <fieldset className="swatch-field">
            <legend>Player color</legend>
            <div className="swatches">
              {PLAYER_COLORS.map((candidate) => (
                <button
                  aria-label={`Use color ${candidate}`}
                  className={candidate === color ? "selected" : ""}
                  key={candidate}
                  onClick={() => setColor(candidate)}
                  style={{ backgroundColor: candidate }}
                  type="button"
                />
              ))}
            </div>
          </fieldset>
          <label className="portrait-picker button secondary-button">
            {portraitUrl ? (
              <Image alt="Selected character portrait" height={38} src={portraitUrl} unoptimized width={38} />
            ) : (
              <ImagePlus aria-hidden="true" />
            )}
            <span>{portrait ? portrait.name : "Optional portrait"}</span>
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Character portrait"
              className="sr-only"
              onChange={(event) => setPortrait(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <button className="button primary-button wide" disabled={pending} type="submit">
            {pending ? "Joining..." : "Enter campaign"}
            <ArrowRight aria-hidden="true" />
          </button>
          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
