"use client";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  connection: Pick<ReadyRoomConnection, "visibleRolls">;
};
export function RoomLog({ connection }: Props) {
  const { visibleRolls } = connection;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Room Log</h2>
        <span>Latest rolls</span>
      </div>
      {visibleRolls().length ? (
        <div className="roll-log">
          {visibleRolls().map((roll) => (
            <article key={roll.id}>
              <strong>{roll.userName}</strong>
              <span>
                {roll.private ? "Private " : ""}
                {roll.expression}: {roll.total}
              </span>
              <small>{roll.parts}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">Dice results will appear here.</p>
      )}
    </section>
  );
}
