"use client";
import type { CombatControls } from "./useCombat";
import type { ReadyRoomConnection } from "./useRoomConnection";
import type { TokenControls } from "./useTokens";
type Props = {
  connection: Pick<ReadyRoomConnection, "room" | "isDm">;
  tokens: Pick<
    TokenControls,
    "setSelectedTokenId" | "canControl" | "deleteToken"
  >;
  combat: Pick<CombatControls, "addCombatEntry">;
};
export function TokenList({
  connection,
  tokens,
  combat: combatControls,
}: Props) {
  const { room, isDm } = connection;
  const { setSelectedTokenId, canControl, deleteToken } = tokens;
  const { addCombatEntry } = combatControls;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Token List</h2>
        <span>{room.tokens.length} total</span>
      </div>
      {room.tokens.length ? (
        <div className="token-list">
          {room.tokens.map((token) => (
            <article key={token.id} style={{ borderColor: token.color }}>
              <div>
                <strong>
                  {token.imageUrl ? (
                    <img
                      className="token-list-image"
                      alt=""
                      draggable={false}
                      src={token.imageUrl}
                    />
                  ) : (
                    token.icon
                  )}{" "}
                  {token.name}
                </strong>
                <small>
                  {token.type} · {token.ownerName}
                  {token.hp ? ` · ${token.hp}` : ""}
                </small>
              </div>
              <div className="token-actions">
                <button
                  onClick={() => setSelectedTokenId(token.id)}
                  type="button"
                >
                  Edit
                </button>
                {isDm ? (
                  <button onClick={() => addCombatEntry(token)} type="button">
                    Init
                  </button>
                ) : null}
                {canControl(token) ? (
                  <button onClick={() => deleteToken(token.id)} type="button">
                    Delete
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">
          Create a token from the left panel to place it on the grid.
        </p>
      )}
    </section>
  );
}
