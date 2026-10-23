"use client";
import type { ReadyRoomConnection } from "./useRoomConnection";
import type { TokenControls } from "./useTokens";
type Props = {
  tokens: Pick<
    TokenControls,
    | "canControl"
    | "selectedToken"
    | "updateToken"
    | "handleSelectedTokenImage"
    | "deleteToken"
  >;
  connection: Pick<
    ReadyRoomConnection,
    "isDm" | "profile" | "sendCommands" | "room"
  >;
};
export function SelectedToken({ tokens, connection }: Props) {
  const {
    canControl,
    selectedToken,
    updateToken,
    handleSelectedTokenImage,
    deleteToken,
  } = tokens;
  const { isDm, profile, sendCommands, room } = connection;
  if (!selectedToken) return null;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Selected Token</h2>
        <span>{canControl(selectedToken) ? "Editable" : "Locked"}</span>
      </div>
      <label>
        Name
        <input
          disabled={!canControl(selectedToken)}
          value={selectedToken.name}
          onChange={(event) =>
            updateToken(selectedToken.id, { name: event.target.value })
          }
        />
      </label>
      <div className="dice-row">
        <label>
          Icon
          <input
            disabled={!canControl(selectedToken)}
            maxLength={4}
            value={selectedToken.icon}
            onChange={(event) =>
              updateToken(selectedToken.id, { icon: event.target.value })
            }
          />
        </label>
        <label>
          Size
          <input
            disabled={!canControl(selectedToken)}
            min={1}
            max={4}
            type="number"
            value={selectedToken.size}
            onChange={(event) =>
              updateToken(selectedToken.id, {
                size: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      {isDm ||
      selectedToken.ownerId === profile.id ||
      selectedToken.hp !== undefined ? (
        <label>
          HP / status
          <input
            disabled={!canControl(selectedToken)}
            placeholder="23/31, prone, blessed"
            value={selectedToken.hp ?? ""}
            onChange={(event) =>
              updateToken(selectedToken.id, { hp: event.target.value })
            }
          />
        </label>
      ) : null}
      <label>
        Note
        <input
          disabled={!canControl(selectedToken)}
          placeholder={isDm ? "Hidden encounter note" : "Character note"}
          value={selectedToken.note ?? ""}
          onChange={(event) =>
            updateToken(selectedToken.id, { note: event.target.value })
          }
        />
      </label>
      <label>
        Token picture
        <input
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={!canControl(selectedToken)}
          onChange={(event) =>
            handleSelectedTokenImage(event.target.files?.[0] ?? null)
          }
          type="file"
        />
      </label>
      {selectedToken.imageUrl ? (
        <div className="token-preview">
          <img
            alt={`${selectedToken.name} preview`}
            src={selectedToken.imageUrl}
          />
          <div>
            <strong>{selectedToken.imageName ?? "Custom picture"}</strong>
            {canControl(selectedToken) ? (
              <button
                className="secondary-action compact"
                onClick={() =>
                  updateToken(selectedToken.id, {
                    imageName: undefined,
                    imageUrl: undefined,
                  })
                }
                type="button"
              >
                Remove picture
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="empty-state">
          No custom picture. The chip is using its icon.
        </p>
      )}
      {isDm ? (
        <label>
          Token owner
          <select
            aria-label="Token owner"
            value={selectedToken.ownerId}
            onChange={(event) =>
              sendCommands([
                {
                  type: "token.assign",
                  payload: {
                    id: selectedToken.id,
                    ownerId: event.target.value,
                  },
                },
              ])
            }
          >
            {room.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nickname}
                {member.role === "dm" ? " (DM)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {canControl(selectedToken) ? (
        <button
          className="secondary-action compact danger"
          onClick={() => deleteToken(selectedToken.id)}
          type="button"
        >
          Delete selected
        </button>
      ) : null}
    </section>
  );
}
