"use client";

import {
  Activity,
  BookmarkPlus,
  CircleDot,
  ImageOff,
  ImagePlus,
  Plus,
  Search,
  Swords,
  Trash2,
  UserRound
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { emitWithAck } from "../../lib/client/realtime";
import { CONDITION_PRESETS } from "../../lib/domain/defaults";
import { createUuid } from "../../lib/domain/id";
import type {
  CampaignPlayer,
  InitiativeEntry,
  InitiativeRollMode,
  LibraryItem,
  SceneCommand,
  SceneRecord,
  SceneToken,
  TokenCondition,
  TokenKind
} from "../../lib/domain/types";
import type { BattleMode } from "./BattleCanvas";
import { MapCalibration } from "./MapCalibration";

type Props = {
  campaignId: string;
  mode: BattleMode;
  players: CampaignPlayer[];
  scene: SceneRecord;
  selectedToken: SceneToken | null;
  onCommand: (command: SceneCommand) => Promise<void>;
  onCreateToken: (template?: Partial<SceneToken>) => void;
  onSelectToken: (tokenId: string) => void;
};

const TOKEN_KINDS: TokenKind[] = ["character", "npc", "monster", "object"];

export function EncounterInspector({
  campaignId,
  mode,
  players,
  scene,
  selectedToken,
  onCommand,
  onCreateToken,
  onSelectToken
}: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const [tokenDraft, setTokenDraft] = useState({
    name: "Hero",
    icon: "⚔",
    kind: "character" as TokenKind,
    color: "#b83c52",
    size: 1
  });
  const [custom, setCustom] = useState({
    label: "",
    color: "#b83c52",
    animation: "pulse" as TokenCondition["animation"],
    durationRounds: "" as number | ""
  });
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryKind, setLibraryKind] = useState<"token" | "object">("token");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryTokenId, setLibraryTokenId] = useState("");
  const [initiativeValues, setInitiativeValues] = useState<Record<string, string>>({});
  const [initiativeDex, setInitiativeDex] = useState<Record<string, number>>({});
  const [initiativeModes, setInitiativeModes] = useState<Record<string, Exclude<InitiativeRollMode, "manual">>>({});
  const [rollingId, setRollingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<{ items: LibraryItem[] }>("/api/v1/library")
      .then(({ items }) => setLibrary(items))
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  useEffect(() => {
    if (mode !== "library") return;
    void apiFetch<{ items: LibraryItem[] }>("/api/v1/library")
      .then(({ items }) => setLibrary(items))
      .catch((caught) => setError(errorMessage(caught)));
  }, [mode]);

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return library
      .filter((item) => item.kind === libraryKind)
      .filter((item) => !query || `${item.name} ${item.category}`.toLowerCase().includes(query));
  }, [library, libraryKind, librarySearch]);

  async function updateToken(patch: SceneCommand & { type: "token.update" }) {
    await onCommand(patch);
  }

  async function uploadTokenImage(file: File | null) {
    if (!file || !selectedToken) return;
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "token");
      form.set("campaignId", campaignId);
      const { asset } = await apiFetch<{ asset: { id: string } }>("/api/v1/assets", { method: "POST", body: form });
      await updateToken({ type: "token.update", tokenId: selectedToken.id, patch: { assetId: asset.id } });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function addCondition(condition: Omit<TokenCondition, "id">) {
    if (!selectedToken) return;
    await onCommand({
      type: "condition.add",
      tokenId: selectedToken.id,
      condition: { ...condition, id: createUuid() }
    });
  }

  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = custom.label.trim();
    if (!label) return;
    await addCondition({
      key: label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      label,
      icon: "Sparkles",
      color: custom.color,
      animation: custom.animation,
      durationRounds: custom.durationRounds || null
    });
    setCustom((value) => ({ ...value, label: "" }));
  }

  function createToken() {
    onCreateToken({ ...tokenDraft });
    setTokenDraft((current) => ({ ...current, name: current.kind === "object" ? "Map object" : "New token" }));
  }

  function placeLibraryItem(item: LibraryItem) {
    onCreateToken({
      name: item.name,
      icon: typeof item.data.icon === "string" ? item.data.icon : item.kind === "object" ? "□" : "●",
      kind: item.kind === "object" ? "object" : ((item.data.kind as TokenKind | undefined) ?? "npc"),
      assetId: item.assetId,
      color: typeof item.data.color === "string" ? item.data.color : "#b83c52",
      size: typeof item.data.size === "number" ? item.data.size : 1,
      hp: typeof item.data.hp === "string" ? item.data.hp : null,
      note: typeof item.data.note === "string" ? item.data.note : null,
      conditions: Array.isArray(item.data.conditions) ? (item.data.conditions as TokenCondition[]) : []
    });
  }

  async function saveSelectedToken(token: SceneToken | null = selectedToken) {
    if (!token) return;
    try {
      const kind = token.kind === "object" ? "object" : "token";
      const { item } = await apiFetch<{ item: LibraryItem }>("/api/v1/library", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: token.name,
          category:
            token.kind === "character"
              ? "Characters"
              : token.kind === "npc"
                ? "NPCs"
                : token.kind === "monster"
                  ? "Monsters"
                  : "Map objects",
          visibility: "private",
          assetId: token.assetId,
          data: {
            icon: token.icon,
            kind: token.kind,
            color: token.color,
            size: token.size,
            hp: token.hp,
            note: token.note,
            conditions: token.conditions,
            sourceTokenId: token.id,
            autoKey: [
              token.kind,
              token.name.trim().toLowerCase(),
              token.icon,
              token.assetId ?? "",
              token.size
            ].join("|")
          }
        })
      });
      setLibrary((current) => [item, ...current.filter((candidate) => candidate.id !== item.id)]);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function initiativeEntry(token: SceneToken, index: number): InitiativeEntry {
    return {
      id: createUuid(),
      tokenId: token.id,
      name: token.name,
      ownerId: token.ownerId,
      ownerName: token.ownerName,
      dexModifier: 0,
      roll: null,
      total: 0,
      mode: "normal",
      conditions: token.conditions.map((condition) => condition.label),
      submitted: false,
      source: null,
      skipped: false,
      createdAt: Date.now() + index
    };
  }

  async function startCombat() {
    const entries = scene.state.tokens.filter((token) => token.kind !== "object").map(initiativeEntry);
    await onCommand({
      type: "combat.update",
      combat: {
        active: false,
        phase: "initiative",
        round: 1,
        currentTurnIndex: 0,
        startedAt: Date.now(),
        entries
      }
    });
  }

  async function beginCombat() {
    const entries = [...scene.state.combat.entries].sort(
      (left, right) =>
        right.total - left.total || right.dexModifier - left.dexModifier || left.createdAt - right.createdAt
    );
    await onCommand({
      type: "combat.update",
      combat: { ...scene.state.combat, active: true, phase: "active", round: 1, currentTurnIndex: 0, entries }
    });
  }

  async function advanceTurn(direction: 1 | -1) {
    const combat = scene.state.combat;
    if (!combat.entries.length) return;
    let next = combat.currentTurnIndex + direction;
    let round = combat.round;
    if (next >= combat.entries.length) {
      next = 0;
      round += 1;
    } else if (next < 0) {
      next = combat.entries.length - 1;
      round = Math.max(1, round - 1);
    }
    await onCommand({ type: "combat.update", combat: { ...combat, currentTurnIndex: next, round } });
  }

  async function submitManual(entry: InitiativeEntry) {
    const initiative = Number(initiativeValues[entry.id]);
    if (!Number.isFinite(initiative)) return;
    try {
      await emitWithAck("combat:initiative", {
        campaignId,
        sceneId: scene.id,
        tokenId: entry.tokenId,
        baseVersion: scene.version,
        initiative,
        dexModifier: initiativeDex[entry.id] ?? entry.dexModifier
      });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function rollInitiative(entry: InitiativeEntry) {
    setRollingId(entry.id);
    try {
      await emitWithAck("combat:initiative-roll", {
        campaignId,
        sceneId: scene.id,
        tokenId: entry.tokenId,
        baseVersion: scene.version,
        dexModifier: initiativeDex[entry.id] ?? entry.dexModifier,
        mode: initiativeModes[entry.id] ?? "normal"
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRollingId(null);
    }
  }

  async function skipInitiative(entry: InitiativeEntry) {
    await onCommand({
      type: "combat.update",
      combat: {
        ...scene.state.combat,
        entries: scene.state.combat.entries.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, submitted: true, skipped: true, source: "dm", total: 0 }
            : candidate
        )
      }
    });
  }

  const pendingInitiative = scene.state.combat.entries.filter((entry) => !entry.submitted && !entry.skipped);
  const libraryToken =
    scene.state.tokens.find((token) => token.id === libraryTokenId) ?? selectedToken ?? scene.state.tokens[0] ?? null;

  return (
    <aside className="campaign-inspector encounter-inspector">
      {mode === "table" ? (
        <>
          <section className="inspector-section scene-summary">
            <div className="inspector-heading">
              <div>
                <small>Active encounter</small>
                <h2>{scene.name}</h2>
              </div>
              <CircleDot aria-hidden="true" />
            </div>
            <dl className="scene-metrics">
              <div>
                <dt>Grid</dt>
                <dd>
                  {scene.state.grid.columns} × {scene.state.grid.rows}
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>{scene.state.grid.feetPerCell} ft</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{scene.state.tokens.length}</dd>
              </div>
            </dl>
            <div className="token-create-grid">
              <input
                aria-label="New token name"
                maxLength={80}
                value={tokenDraft.name}
                onChange={(event) => setTokenDraft({ ...tokenDraft, name: event.target.value })}
              />
              <input
                aria-label="New token icon"
                maxLength={4}
                value={tokenDraft.icon}
                onChange={(event) => setTokenDraft({ ...tokenDraft, icon: event.target.value })}
              />
              <select
                aria-label="New token kind"
                value={tokenDraft.kind}
                onChange={(event) => setTokenDraft({ ...tokenDraft, kind: event.target.value as TokenKind })}
              >
                {TOKEN_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
              <input
                aria-label="New token color"
                type="color"
                value={tokenDraft.color}
                onChange={(event) => setTokenDraft({ ...tokenDraft, color: event.target.value })}
              />
              <button aria-label="Add token" className="button primary-button" onClick={createToken} type="button">
                <Plus aria-hidden="true" /> Add
              </button>
            </div>
          </section>

          {selectedToken ? (
            <section className="inspector-section token-editor">
              <div className="inspector-heading">
                <div>
                  <small>Selected token</small>
                  <h3>{selectedToken.name}</h3>
                </div>
                <button
                  className="icon-button danger"
                  aria-label="Delete token"
                  title="Delete token"
                  onClick={() => void onCommand({ type: "token.delete", tokenId: selectedToken.id })}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
              <label>
                Name
                <input
                  defaultValue={selectedToken.name}
                  key={`${selectedToken.id}-name`}
                  onBlur={(event) =>
                    void updateToken({
                      type: "token.update",
                      tokenId: selectedToken.id,
                      patch: { name: event.target.value }
                    })
                  }
                />
              </label>
              <div className="field-pair">
                <label>
                  Icon
                  <input
                    maxLength={4}
                    value={selectedToken.icon}
                    onChange={(event) =>
                      void updateToken({
                        type: "token.update",
                        tokenId: selectedToken.id,
                        patch: { icon: event.target.value }
                      })
                    }
                  />
                </label>
                <label>
                  Kind
                  <select
                    value={selectedToken.kind}
                    onChange={(event) =>
                      void updateToken({
                        type: "token.update",
                        tokenId: selectedToken.id,
                        patch: { kind: event.target.value as TokenKind }
                      })
                    }
                  >
                    {TOKEN_KINDS.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-pair">
                <label>
                  HP
                  <input
                    defaultValue={selectedToken.hp ?? ""}
                    key={`${selectedToken.id}-hp`}
                    onBlur={(event) =>
                      void updateToken({
                        type: "token.update",
                        tokenId: selectedToken.id,
                        patch: { hp: event.target.value || null }
                      })
                    }
                  />
                </label>
                <label>
                  Size
                  <input
                    min={1}
                    max={8}
                    type="number"
                    value={selectedToken.size}
                    onChange={(event) =>
                      void updateToken({
                        type: "token.update",
                        tokenId: selectedToken.id,
                        patch: { size: Number(event.target.value) }
                      })
                    }
                  />
                </label>
              </div>
              <label>
                Note
                <textarea
                  defaultValue={selectedToken.note ?? ""}
                  key={`${selectedToken.id}-note`}
                  onBlur={(event) =>
                    void updateToken({
                      type: "token.update",
                      tokenId: selectedToken.id,
                      patch: { note: event.target.value || null }
                    })
                  }
                  rows={3}
                />
              </label>
              <label>
                <span>
                  <UserRound aria-hidden="true" /> Player owner
                </span>
                <select
                  value={selectedToken.ownerId ?? ""}
                  onChange={(event) => {
                    const player = players.find((candidate) => candidate.id === event.target.value);
                    void updateToken({
                      type: "token.update",
                      tokenId: selectedToken.id,
                      patch: { ownerId: player?.id ?? null, ownerName: player?.nickname ?? null }
                    });
                  }}
                >
                  <option value="">DM controlled</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={(event) => void uploadTokenImage(event.target.files?.[0] ?? null)}
                ref={imageInput}
                type="file"
              />
              <div className="button-row">
                <button className="button secondary-button" onClick={() => imageInput.current?.click()} type="button">
                  <ImagePlus aria-hidden="true" /> Portrait
                </button>
                {selectedToken.assetId ? (
                  <button
                    className="button danger-button"
                    onClick={() =>
                      void updateToken({ type: "token.update", tokenId: selectedToken.id, patch: { assetId: null } })
                    }
                    type="button"
                  >
                    <ImageOff aria-hidden="true" /> Remove
                  </button>
                ) : null}
                <button className="button secondary-button" onClick={() => void saveSelectedToken()} type="button">
                  <BookmarkPlus aria-hidden="true" /> Save preset
                </button>
              </div>
              <ConditionEditor
                custom={custom}
                onAdd={addCondition}
                onAddCustom={addCustom}
                onCustom={setCustom}
                onRemove={(conditionId) =>
                  void onCommand({ type: "condition.remove", tokenId: selectedToken.id, conditionId })
                }
                token={selectedToken}
              />
            </section>
          ) : (
            <section className="inspector-section selection-empty">
              <CircleDot aria-hidden="true" />
              <h3>No token selected</h3>
              <p>Select a token on the map or in the list.</p>
            </section>
          )}
          <section className="inspector-section token-list-panel">
            <div className="inspector-heading">
              <div>
                <small>Scene contents</small>
                <h3>Token list</h3>
              </div>
              <b>{scene.state.tokens.length}</b>
            </div>
            {scene.state.tokens.map((token) => (
              <button
                className={selectedToken?.id === token.id ? "token-list-row active" : "token-list-row"}
                key={token.id}
                onClick={() => onSelectToken(token.id)}
                type="button"
              >
                <span style={{ borderColor: token.color }}>{token.icon}</span>
                <div>
                  <strong>{token.name}</strong>
                  <small>
                    {token.kind}
                    {token.hp ? ` · ${token.hp}` : ""}
                  </small>
                </div>
              </button>
            ))}
          </section>
        </>
      ) : null}

      {mode === "combat" ? (
        <section className="inspector-section combat-panel expanded">
          <div className="inspector-heading">
            <div>
              <small>Initiative</small>
              <h2>
                {scene.state.combat.phase === "active"
                  ? `Round ${scene.state.combat.round}`
                  : scene.state.combat.phase === "initiative"
                    ? "Roll initiative"
                    : "Combat setup"}
              </h2>
            </div>
            <Swords aria-hidden="true" />
          </div>
          <div className="combat-actions">
            <button
              className="button primary-button"
              disabled={!scene.state.tokens.some((token) => token.kind !== "object")}
              onClick={() => void startCombat()}
              type="button"
            >
              {scene.state.combat.phase === "idle" ? "Start combat" : "Restart"}
            </button>
            <button
              className="button secondary-button"
              disabled={
                scene.state.combat.phase !== "initiative" ||
                !scene.state.combat.entries.length ||
                pendingInitiative.length > 0
              }
              onClick={() => void beginCombat()}
              type="button"
            >
              Begin round
            </button>
            <button
              className="icon-button"
              aria-label="Previous turn"
              disabled={scene.state.combat.phase !== "active"}
              onClick={() => void advanceTurn(-1)}
              type="button"
            >
              ←
            </button>
            <button
              className="icon-button"
              aria-label="Next turn"
              disabled={scene.state.combat.phase !== "active"}
              onClick={() => void advanceTurn(1)}
              type="button"
            >
              →
            </button>
          </div>
          {scene.state.combat.entries.length ? (
            <ol className="initiative-editor-list">
              {scene.state.combat.entries.map((entry, index) => (
                <li
                  className={
                    index === scene.state.combat.currentTurnIndex && scene.state.combat.phase === "active"
                      ? "active"
                      : ""
                  }
                  key={entry.id}
                >
                  <div className="initiative-entry-heading">
                    <span>{index + 1}</span>
                    <strong>{entry.name}</strong>
                    <b>{entry.skipped ? "Skipped" : entry.submitted ? entry.total : "Waiting"}</b>
                  </div>
                  {scene.state.combat.phase === "initiative" && !entry.submitted ? (
                    <>
                      <div className="initiative-fields">
                        <input
                          aria-label={`${entry.name} dexterity modifier`}
                          type="number"
                          value={initiativeDex[entry.id] ?? entry.dexModifier}
                          onChange={(event) =>
                            setInitiativeDex({ ...initiativeDex, [entry.id]: Number(event.target.value) })
                          }
                        />
                        <select
                          aria-label={`${entry.name} roll mode`}
                          value={initiativeModes[entry.id] ?? "normal"}
                          onChange={(event) =>
                            setInitiativeModes({
                              ...initiativeModes,
                              [entry.id]: event.target.value as Exclude<InitiativeRollMode, "manual">
                            })
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="advantage">Advantage</option>
                          <option value="disadvantage">Disadvantage</option>
                        </select>
                        <button
                          disabled={rollingId === entry.id}
                          onClick={() => void rollInitiative(entry)}
                          type="button"
                        >
                          {rollingId === entry.id ? "Rolling" : "Roll"}
                        </button>
                      </div>
                      <div className="manual-initiative">
                        <input
                          aria-label={`${entry.name} manual initiative`}
                          placeholder="Manual total"
                          type="number"
                          value={initiativeValues[entry.id] ?? ""}
                          onChange={(event) =>
                            setInitiativeValues({ ...initiativeValues, [entry.id]: event.target.value })
                          }
                        />
                        <button
                          disabled={!initiativeValues[entry.id]}
                          onClick={() => void submitManual(entry)}
                          type="button"
                        >
                          Submit
                        </button>
                        <button onClick={() => void skipInitiative(entry)} type="button">
                          Skip
                        </button>
                      </div>
                    </>
                  ) : (
                    <small>
                      {entry.ownerName ?? "DM controlled"}
                      {entry.conditions.length ? ` · ${entry.conditions.join(", ")}` : ""}
                    </small>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Start combat to collect initiative from every non-object token.</p>
          )}
          {scene.state.combat.phase !== "idle" ? (
            <div className="button-row">
              <button
                className="button secondary-button"
                onClick={() =>
                  void onCommand({
                    type: "combat.update",
                    combat: { ...scene.state.combat, active: false, phase: "idle", currentTurnIndex: 0 }
                  })
                }
                type="button"
              >
                End combat
              </button>
              <button
                className="button danger-button"
                onClick={() =>
                  void onCommand({
                    type: "combat.update",
                    combat: { active: false, phase: "idle", round: 1, currentTurnIndex: 0, entries: [] }
                  })
                }
                type="button"
              >
                Clear
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "build" ? (
        <MapCalibration campaignId={campaignId} grid={scene.state.grid} onCommand={onCommand} />
      ) : null}

      {mode === "library" ? (
        <section className="inspector-section encounter-library">
          <div className="inspector-heading">
            <div>
              <small>Reusable presets</small>
              <h2>Build library</h2>
            </div>
            <Search aria-hidden="true" />
          </div>
          <div className="segmented-control">
            <button
              className={libraryKind === "token" ? "active" : ""}
              onClick={() => setLibraryKind("token")}
              type="button"
            >
              Tokens
            </button>
            <button
              className={libraryKind === "object" ? "active" : ""}
              onClick={() => setLibraryKind("object")}
              type="button"
            >
              Objects
            </button>
          </div>
          <input
            aria-label="Filter encounter library"
            placeholder="Filter presets"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
          />
          {scene.state.tokens.length ? (
            <div className="library-save-token">
              <select
                aria-label="Scene token to save"
                value={libraryToken?.id ?? ""}
                onChange={(event) => setLibraryTokenId(event.target.value)}
              >
                {scene.state.tokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.name}
                  </option>
                ))}
              </select>
              <button
                className="button secondary-button"
                onClick={() => void saveSelectedToken(libraryToken)}
                type="button"
              >
                <BookmarkPlus aria-hidden="true" /> Save scene token as preset
              </button>
            </div>
          ) : null}
          {filteredLibrary.length ? (
            <div className="encounter-library-list">
              {filteredLibrary.map((item) => (
                <article key={item.id}>
                  {item.assetId ? (
                    <Image alt="" height={44} src={`/api/v1/assets/${item.assetId}`} unoptimized width={44} />
                  ) : (
                    <span
                      style={{ backgroundColor: typeof item.data.color === "string" ? item.data.color : "#b83c52" }}
                    >
                      {typeof item.data.icon === "string" ? item.data.icon : item.name.slice(0, 1)}
                    </span>
                  )}
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category} · size {typeof item.data.size === "number" ? item.data.size : 1}
                    </small>
                  </div>
                  <button className="button secondary-button" onClick={() => placeLibraryItem(item)} type="button">
                    Place
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">Create token and object presets from the dashboard.</p>
          )}
        </section>
      ) : null}
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

type CustomCondition = {
  label: string;
  color: string;
  animation: TokenCondition["animation"];
  durationRounds: number | "";
};

function ConditionEditor({
  custom,
  onAdd,
  onAddCustom,
  onCustom,
  onRemove,
  token
}: {
  custom: CustomCondition;
  onAdd: (condition: Omit<TokenCondition, "id">) => Promise<void>;
  onAddCustom: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCustom: (value: CustomCondition) => void;
  onRemove: (id: string) => void;
  token: SceneToken;
}) {
  return (
    <div className="condition-editor">
      <div className="subheading">
        <Activity aria-hidden="true" />
        <strong>Conditions</strong>
      </div>
      {token.conditions.length ? (
        <div className="active-conditions">
          {token.conditions.map((condition) => (
            <button
              key={condition.id}
              onClick={() => onRemove(condition.id)}
              style={{ borderColor: condition.color }}
              type="button"
            >
              <span style={{ backgroundColor: condition.color }} />
              {condition.label}
              {condition.durationRounds ? ` ${condition.durationRounds}r` : ""}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="condition-presets">
        {CONDITION_PRESETS.map((condition) => (
          <button
            disabled={token.conditions.some((active) => active.key === condition.key)}
            key={condition.key}
            onClick={() => void onAdd(condition)}
            title={`Add ${condition.label}`}
            type="button"
          >
            <span style={{ backgroundColor: condition.color }} />
            {condition.label}
          </button>
        ))}
      </div>
      <form className="custom-condition" onSubmit={(event) => void onAddCustom(event)}>
        <input
          aria-label="Custom condition name"
          maxLength={48}
          placeholder="Custom condition"
          value={custom.label}
          onChange={(event) => onCustom({ ...custom, label: event.target.value })}
        />
        <input
          aria-label="Custom condition color"
          type="color"
          value={custom.color}
          onChange={(event) => onCustom({ ...custom, color: event.target.value })}
        />
        <select
          aria-label="Condition animation"
          value={custom.animation}
          onChange={(event) => onCustom({ ...custom, animation: event.target.value as TokenCondition["animation"] })}
        >
          <option value="none">Static</option>
          <option value="pulse">Pulse</option>
          <option value="aura">Aura</option>
          <option value="embers">Embers</option>
        </select>
        <input
          aria-label="Condition duration in rounds"
          max={99}
          min={1}
          onChange={(event) =>
            onCustom({ ...custom, durationRounds: event.target.value ? Number(event.target.value) : "" })
          }
          placeholder="Rounds"
          type="number"
          value={custom.durationRounds}
        />
        <button className="icon-button" aria-label="Add custom condition" title="Add condition" type="submit">
          <Plus aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
