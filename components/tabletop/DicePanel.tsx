"use client";
import { useState } from "react";
import { QUICK_DICE } from "./model";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  visible: boolean;
  connection: Pick<ReadyRoomConnection, "sendCommands">;
};
export function DicePanel({ visible, connection }: Props) {
  const { sendCommands } = connection;
  const [diceExpression, setDiceExpression] = useState("d20");
  const [privateRoll, setPrivateRoll] = useState(false);
  const [diceError, setDiceError] = useState("");
  function doRoll(expression = diceExpression) {
    setDiceError("");
    sendCommands([
      { type: "dice.roll", payload: { expression, private: privateRoll } },
    ]);
  }
  if (!visible) return null;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Dice</h2>
        <span>{privateRoll ? "Private" : "Public"}</span>
      </div>
      <div className="quick-dice">
        {QUICK_DICE.map((die) => (
          <button key={die} onClick={() => doRoll(die)} type="button">
            {die}
          </button>
        ))}
      </div>
      <div className="dice-row">
        <input
          value={diceExpression}
          onChange={(event) => setDiceExpression(event.target.value)}
        />
        <button onClick={() => doRoll()} type="button">
          Roll
        </button>
      </div>
      <label className="inline-check">
        <input
          checked={privateRoll}
          onChange={(event) => setPrivateRoll(event.target.checked)}
          type="checkbox"
        />
        Private roll
      </label>
      {diceError ? <p className="error-text">{diceError}</p> : null}
    </section>
  );
}
