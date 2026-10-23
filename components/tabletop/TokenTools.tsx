"use client";
import type { TokenType } from "../../lib/types";
import { TOKEN_TYPES } from "./model";
import type { TokenControls } from "./useTokens";
type Props = {
  tokens: Pick<
    TokenControls,
    | "newToken"
    | "setNewToken"
    | "addToken"
    | "handleNewTokenImage"
    | "imageError"
  >;
};
export function TokenTools({ tokens }: Props) {
  const { newToken, setNewToken, addToken, handleNewTokenImage, imageError } =
    tokens;
  return (
    <section className="tool-card">
      <div className="panel-heading">
        <h2>Tokens</h2>
        <span>Create chip</span>
      </div>
      <input
        aria-label="Token name"
        value={newToken.name}
        onChange={(event) =>
          setNewToken((current) => ({ ...current, name: event.target.value }))
        }
      />
      <div className="dice-row">
        <input
          aria-label="Token icon"
          value={newToken.icon}
          onChange={(event) =>
            setNewToken((current) => ({ ...current, icon: event.target.value }))
          }
          maxLength={4}
        />
        <select
          value={newToken.type}
          onChange={(event) =>
            setNewToken((current) => ({
              ...current,
              type: event.target.value as TokenType,
            }))
          }
        >
          {TOKEN_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </div>
      <button
        className="primary-action compact"
        onClick={addToken}
        type="button"
      >
        Add token
      </button>
      <label>
        Token picture
        <input
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) =>
            handleNewTokenImage(event.target.files?.[0] ?? null)
          }
          type="file"
        />
      </label>
      {newToken.imageUrl ? (
        <div className="token-preview">
          <img
            alt={`${newToken.name || "New token"} preview`}
            src={newToken.imageUrl}
          />
          <div>
            <strong>{newToken.imageName}</strong>
            <button
              className="secondary-action compact"
              onClick={() =>
                setNewToken((current) => ({
                  ...current,
                  imageName: "",
                  imageUrl: "",
                }))
              }
              type="button"
            >
              Remove picture
            </button>
          </div>
        </div>
      ) : null}
      {imageError ? <p className="error-text">{imageError}</p> : null}
    </section>
  );
}
