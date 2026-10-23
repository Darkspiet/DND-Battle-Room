"use client";
import { useEffect, useMemo, useState } from "react";
import { loadLibraryItems } from "../../lib/dmData";
import type { LibraryItem, LibraryItemKind } from "../../lib/types";
import type { TokenControls } from "./useTokens";
type Props = {
  visible: boolean;
  tokens: Pick<TokenControls, "addLibraryItem">;
};
export function LibraryPanel({ visible, tokens }: Props) {
  const { addLibraryItem } = tokens;
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [libraryKind, setLibraryKind] = useState<LibraryItemKind>("token");
  const [librarySearch, setLibrarySearch] = useState("");
  useEffect(() => {
    loadLibraryItems()
      .then(setLibraryItems)
      .catch(() => setLibraryItems([]));
  }, []);
  const filteredLibraryItems = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return libraryItems
      .filter((item) => item.kind === libraryKind)
      .filter((item) => {
        if (!query) return true;
        return `${item.name} ${item.category} ${item.tokenType}`
          .toLowerCase()
          .includes(query);
      });
  }, [libraryItems, libraryKind, librarySearch]);
  if (!visible) return null;
  return (
    <section className="tool-card library-panel">
      <div className="panel-heading">
        <h2>Build Library</h2>
        <span>{filteredLibraryItems.length} shown</span>
      </div>
      <div className="mode-tabs" aria-label="In-game library kind">
        <button
          className={libraryKind === "token" ? "selected" : ""}
          onClick={() => setLibraryKind("token")}
          type="button"
        >
          Tokens
        </button>
        <button
          className={libraryKind === "object" ? "selected" : ""}
          onClick={() => setLibraryKind("object")}
          type="button"
        >
          Objects
        </button>
      </div>
      <input
        aria-label="Filter build library"
        placeholder="Filter shared library"
        value={librarySearch}
        onChange={(event) => setLibrarySearch(event.target.value)}
      />
      <div className="library-list">
        {filteredLibraryItems.length ? (
          filteredLibraryItems.map((item) => (
            <article key={item.id}>
              {item.imageUrl ? (
                <img alt="" draggable={false} src={item.imageUrl} />
              ) : (
                <span>{item.icon}</span>
              )}
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.category} · size {item.size}
                </small>
              </div>
              <button
                className="secondary-action compact"
                onClick={() => addLibraryItem(item)}
                type="button"
              >
                Place
              </button>
            </article>
          ))
        ) : (
          <p className="empty-state">
            Create shared presets in the DM dashboard.
          </p>
        )}
      </div>
    </section>
  );
}
