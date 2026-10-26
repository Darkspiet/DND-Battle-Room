"use client";

import { Dices, EyeOff, Send } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { emitWithAck, realtimeSocket } from "../../lib/client/realtime";
import type { DiceRollRecord } from "../../lib/domain/types";

type Roll = DiceRollRecord;

export function DiceTray({ campaignId, sceneId }: { campaignId: string; sceneId: string }) {
  const [expression, setExpression] = useState("1d20+5");
  const [isPrivate, setPrivate] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<{ rolls: Roll[] }>(`/api/v1/scenes/${sceneId}/rolls?limit=30`)
      .then(({ rolls: history }) => setRolls(history))
      .catch((caught) => setError(errorMessage(caught)));
    const socket = realtimeSocket();
    const receive = (roll: Roll) =>
      setRolls((current) => [roll, ...current.filter((candidate) => candidate.id !== roll.id)].slice(0, 30));
    socket.on("dice:result", receive);
    return () => {
      socket.off("dice:result", receive);
    };
  }, [sceneId]);

  async function rollExpression(nextExpression: string) {
    setError("");
    try {
      await emitWithAck<Roll>("dice:roll", { campaignId, sceneId, expression: nextExpression, private: isPrivate });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not roll dice.");
    }
  }

  function roll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void rollExpression(expression);
  }

  return (
    <section className="dice-tray">
      <form onSubmit={roll}>
        <Dices aria-hidden="true" />
        <div className="quick-dice" aria-label="Quick dice">
          {["1d4", "1d6", "1d8", "1d10", "1d12", "1d20"].map((die) => (
            <button
              aria-label={`Roll ${die.slice(1)}`}
              key={die}
              onClick={() => {
                setExpression(die);
                void rollExpression(die);
              }}
              type="button"
            >
              {die.slice(1)}
            </button>
          ))}
        </div>
        <input
          aria-label="Dice expression"
          maxLength={80}
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
        />
        <label className="private-roll">
          <input checked={isPrivate} onChange={(event) => setPrivate(event.target.checked)} type="checkbox" />
          <EyeOff aria-hidden="true" />
          <span>Private</span>
        </label>
        <button className="icon-button accent" aria-label="Roll dice" title="Roll dice" type="submit">
          <Send aria-hidden="true" />
        </button>
      </form>
      {rolls.length ? (
        <div className="roll-strip">
          {rolls.map((roll) => (
            <span key={roll.id} title={roll.output}>
              <strong>{roll.total}</strong>
              <small>
                {roll.actorName} · {roll.expression}
                {roll.private ? " · private" : ""}
              </small>
            </span>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="audio-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
