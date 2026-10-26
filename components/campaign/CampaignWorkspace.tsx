"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft, Check, Clipboard, Dices, Globe2, Hammer, Library, Map, Plus, Radio, Settings2, Swords, Table2, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { campaignJoinUrl, copyText } from "../../lib/client/clipboard";
import { emitWithAck, realtimeSocket } from "../../lib/client/realtime";
import { createUuid } from "../../lib/domain/id";
import type {
  Actor,
  CampaignPlayer,
  DMUser,
  SceneCommand,
  SceneRecord,
  SceneToken,
  WorldLocation
} from "../../lib/domain/types";
import { AudioDock } from "./AudioDock";
import { BattleCanvas, type BattleMode } from "./BattleCanvas";
import { DiceTray } from "./DiceTray";
import { EncounterInspector } from "./EncounterInspector";
import type { CampaignWorkspaceData } from "./model";
import { WorldCanvas } from "./WorldCanvas";
import { WorldMapEditor } from "./WorldMapEditor";

function playerDestinationLabel(player: CampaignPlayer, scenes: SceneRecord[]) {
  const destination = player.destination;
  if (destination.kind === "world") return "World map";
  return scenes.find((scene) => scene.id === destination.sceneId)?.name ?? "Battle";
}

export function CampaignWorkspace({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [user, setUser] = useState<DMUser | null>(null);
  const [workspace, setWorkspace] = useState<CampaignWorkspaceData | null>(null);
  const [activeView, setActiveView] = useState<"world" | "battle">("world");
  const [battleMode, setBattleMode] = useState<BattleMode>("table");
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [locationDialog, setLocationDialog] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ name: "", description: "", revealed: false });
  const [campaignDraft, setCampaignDraft] = useState({ name: "", description: "" });
  const [connected, setConnected] = useState(false);
  const [zoom, setZoom] = useState(0.8);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const sceneRef = useRef<SceneRecord | null>(null);
  const committedRef = useRef(new globalThis.Map<string, SceneRecord>());
  const commandQueueRef = useRef<Promise<void>>(Promise.resolve());

  const load = useCallback(async () => {
    try {
      const [{ user: current }, data] = await Promise.all([
        apiFetch<{ user: DMUser | null }>("/api/v1/auth/session"),
        apiFetch<CampaignWorkspaceData>(`/api/v1/campaigns/${campaignId}`)
      ]);
      if (!current) return router.replace("/dm/login");
      setUser(current);
      for (const scene of data.scenes) committedRef.current.set(scene.id, scene);
      setWorkspace(data);
      setCampaignDraft({ name: data.campaign.name, description: data.campaign.description });
      setSceneId((value) => value ?? data.scenes[0]?.id ?? null);
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [campaignId, router]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { if (!realtimeSocket().connected) void load(); }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const socket = realtimeSocket();
    const onConnect = () => {
      setConnected(true);
      void load();
      void emitWithAck("campaign:watch", { campaignId }).catch((caught) => setError(errorMessage(caught)));
    };
    const onDisconnect = () => {
      setConnected(false);
      setWorkspace((current) => current ? { ...current, scenes: current.scenes.map((scene) => committedRef.current.get(scene.id) ?? scene) } : current);
      setError("Connection lost. Changes are paused until the saved state is reloaded.");
    };
    const onChanged = () => void load();
    const onCommitted = ({ scene }: { scene: SceneRecord }) => {
      committedRef.current.set(scene.id, scene);
      if (sceneRef.current?.id === scene.id) sceneRef.current = scene;
      setWorkspace((current) =>
        current
          ? { ...current, scenes: current.scenes.map((candidate) => (candidate.id === scene.id ? scene : candidate)) }
          : current
      );
    };
    const onPreview = (preview: { sceneId: string; tokenId: string; x: number; y: number }) =>
      setWorkspace((current) =>
        current
          ? {
              ...current,
              scenes: current.scenes.map((scene) =>
                scene.id === preview.sceneId
                  ? {
                      ...scene,
                      state: {
                        ...scene.state,
                        tokens: scene.state.tokens.map((token) =>
                          token.id === preview.tokenId ? { ...token, x: preview.x, y: preview.y } : token
                        )
                      }
                    }
                  : scene
              )
            }
          : current
      );
    const onDestinations = ({ players }: { players: CampaignPlayer[] }) =>
      setWorkspace((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) => players.find((changed) => changed.id === player.id) ?? player)
            }
          : current
      );
    const onAudio = (audioState: CampaignWorkspaceData["audioState"]) =>
      setWorkspace((current) => (current ? { ...current, audioState } : current));

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("campaign:changed", onChanged);
    socket.on("scene:committed", onCommitted);
    socket.on("token:preview", onPreview);
    socket.on("players:destination", onDestinations);
    socket.on("audio:state", onAudio);
    if (!socket.connected) socket.connect();
    else onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("campaign:changed", onChanged);
      socket.off("scene:committed", onCommitted);
      socket.off("token:preview", onPreview);
      socket.off("players:destination", onDestinations);
      socket.off("audio:state", onAudio);
    };
  }, [campaignId, load]);

  const activeScene = workspace?.scenes.find((scene) => scene.id === sceneId) ?? null;
  useEffect(() => {
    sceneRef.current = activeScene;
  }, [activeScene]);

  useEffect(() => {
    if (!sceneId) return;
    void emitWithAck<{ actor: Actor; scene: SceneRecord | null }>("scene:join", { sceneId })
      .then((result) => {
        setActor(result.actor);
        if (result.scene)
          setWorkspace((current) =>
            current
              ? {
                  ...current,
                  scenes: current.scenes.map((scene) => (scene.id === result.scene?.id ? result.scene : scene))
                }
              : current
          );
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [sceneId, connected]);

  const selectedToken = activeScene?.state.tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedLocation = workspace?.locations.find((location) => location.id === selectedLocationId) ?? null;

  function command(sceneCommand: SceneCommand) {
    const execute = async () => {
      const scene = sceneRef.current;
      if (!scene || !realtimeSocket().connected) throw new Error("Changes are paused while disconnected.");
      try {
        const result = await emitWithAck<{ scene: SceneRecord }>("scene:command", {
          commandId: createUuid(),
          sceneId: scene.id,
          baseVersion: scene.version,
          command: sceneCommand
        });
        committedRef.current.set(result.scene.id, result.scene);
        sceneRef.current = result.scene;
        setWorkspace((current) =>
          current
            ? {
                ...current,
                scenes: current.scenes.map((candidate) =>
                  candidate.id === result.scene.id ? result.scene : candidate
                )
              }
            : current
        );
      } catch (caught) {
        setError(errorMessage(caught));
        setWorkspace((current) => current ? { ...current, scenes: current.scenes.map((scene) => committedRef.current.get(scene.id) ?? scene) } : current);
        await load();
        throw caught;
      }
    };
    const queued = commandQueueRef.current.then(execute, execute);
    commandQueueRef.current = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  async function undo() {
    const scene = sceneRef.current;
    if (!scene) return;
    try {
      const result = await emitWithAck<{ scene: SceneRecord }>("scene:undo", {
        commandId: createUuid(),
        sceneId: scene.id,
        baseVersion: scene.version
      });
      setWorkspace((current) =>
        current
          ? {
              ...current,
              scenes: current.scenes.map((candidate) => (candidate.id === result.scene.id ? result.scene : candidate))
            }
          : current
      );
      setSelectedTokenId(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function audioTracksChanged() {
    await load();
    try {
      await emitWithAck("campaign:changed", { campaignId });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function moveToken(token: SceneToken, x: number, y: number, preview: boolean) {
    const scene = sceneRef.current;
    if (!scene || !realtimeSocket().connected) return;
    setWorkspace((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((candidate) =>
              candidate.id === scene.id
                ? {
                    ...candidate,
                    state: {
                      ...candidate.state,
                      tokens: candidate.state.tokens.map((item) => (item.id === token.id ? { ...item, x, y } : item))
                    }
                  }
                : candidate
            )
          }
        : current
    );
    if (preview)
      realtimeSocket().volatile.emit("token:preview", {
        sceneId: scene.id,
        tokenId: token.id,
        x,
        y,
        sequence: Date.now()
      });
    else
      void command({ type: "token.move", tokenId: token.id, x, y }).catch((caught) => {
        setError(errorMessage(caught));
        void load();
      });
  }

  function openLocation(location: WorldLocation) {
    setSceneId(location.sceneId);
    setActiveView("battle");
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiFetch<{ scene: SceneRecord; location: WorldLocation }>(
        `/api/v1/campaigns/${campaignId}/locations`,
        {
          method: "POST",
          body: JSON.stringify({ ...locationDraft, x: Math.random() * 500 - 250, y: Math.random() * 300 - 150 })
        }
      );
      setWorkspace((current) =>
        current
          ? {
              ...current,
              locations: [...current.locations, result.location],
              scenes: [...current.scenes, result.scene]
            }
          : current
      );
      setLocationDraft({ name: "", description: "", revealed: false });
      setSelectedLocationId(result.location.id);
      setLocationDialog(false);
      realtimeSocket().emit("campaign:changed", { campaignId });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function updateLocation(location: WorldLocation, patch: Partial<WorldLocation>) {
    try {
      const { location: updated } = await apiFetch<{ location: WorldLocation }>(
        `/api/v1/campaigns/${campaignId}/locations/${location.id}`,
        { method: "PATCH", body: JSON.stringify(patch) }
      );
      setWorkspace((current) =>
        current
          ? {
              ...current,
              locations: current.locations.map((candidate) => (candidate.id === updated.id ? updated : candidate))
            }
          : current
      );
      realtimeSocket().emit("campaign:changed", { campaignId });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function setDestination(
    playerIds: string[],
    destination: { kind: "world" } | { kind: "scene"; sceneId: string }
  ) {
    if (!playerIds.length) return;
    try {
      const { players } = await emitWithAck<{ players: CampaignPlayer[] }>("players:set-destination", {
        campaignId,
        playerIds,
        destination
      });
      setWorkspace((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) => players.find((changed) => changed.id === player.id) ?? player)
            }
          : current
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function createToken(template: Partial<SceneToken> = {}) {
    if (!activeScene) return;
    const token: SceneToken = {
      id: createUuid(),
      name: `Token ${activeScene.state.tokens.length + 1}`,
      icon: "⚔",
      kind: "character",
      ownerId: null,
      ownerName: null,
      assetId: null,
      color: "#b83c52",
      x: Math.floor(activeScene.state.grid.columns / 2),
      y: Math.floor(activeScene.state.grid.rows / 2),
      size: 1,
      hp: null,
      note: null,
      conditions: [],
      ...template
    };
    void command({ type: "token.create", token })
      .then(() => setSelectedTokenId(token.id))
      .catch((caught) => setError(errorMessage(caught)));
  }

  async function toggleCampaignOpen() {
    if (!workspace) return;
    try {
      const { campaign } = await apiFetch<{ campaign: CampaignWorkspaceData["campaign"] }>(
        `/api/v1/campaigns/${campaignId}`,
        { method: "PATCH", body: JSON.stringify({ joinEnabled: !workspace.campaign.joinEnabled }) }
      );
      setWorkspace({ ...workspace, campaign });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function saveCampaignSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const { campaign } = await apiFetch<{ campaign: CampaignWorkspaceData["campaign"] }>(
        `/api/v1/campaigns/${campaignId}`,
        { method: "PATCH", body: JSON.stringify(campaignDraft) }
      );
      setWorkspace((current) => current ? { ...current, campaign } : current);
      setSettingsOpen(false);
      realtimeSocket().emit("campaign:changed", { campaignId });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const selectedIds = useMemo(() => [...selectedPlayers], [selectedPlayers]);

  async function copyPartyLink() {
    try {
      await copyText(campaignJoinUrl(workspace?.campaign.joinCode ?? ""));
      setCopyStatus("Link copied");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!workspace || !user)
    return (
      <main className="workspace-loading">
        <span className="spinner" />
        <strong>Opening campaign command...</strong>
        {error ? <p className="notice error">{error}</p> : null}
      </main>
    );

  return (
    <main className="campaign-workspace">
      <header className="workspace-header">
        <div className="workspace-identity">
          <Link className="icon-button" aria-label="Back to campaigns" title="Campaigns" href="/dm/dashboard">
            <ArrowLeft aria-hidden="true" />
          </Link>
          <span className="brand-mark">
            <Dices aria-hidden="true" />
          </span>
          <div>
            <small>Campaign command</small>
            <h1>{workspace.campaign.name}</h1>
          </div>
        </div>
        <Tabs.Root
          className="workspace-tabs"
          value={activeView}
          onValueChange={(value) => setActiveView(value as "world" | "battle")}
        >
          <Tabs.List>
            <Tabs.Trigger value="world">
              <Globe2 aria-hidden="true" /> World
            </Tabs.Trigger>
            <Tabs.Trigger value="battle" disabled={!activeScene}>
              <Swords aria-hidden="true" /> Battle
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
        <div className="workspace-status">
          <span className={connected ? "live-status online" : "live-status"}>
            <Radio aria-hidden="true" /> {connected ? "Live" : "Offline"}
          </span>
          <button
            className="join-code"
            onClick={() => void copyPartyLink()}
            title="Copy party join link"
            type="button"
          >
            <span>{copyStatus || "Party link"}</span>
            <code>{workspace.campaign.joinCode}</code>
            <Clipboard aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Toggle player joining"
            title={workspace.campaign.joinEnabled ? "Close player joining" : "Open player joining"}
            onClick={() => void toggleCampaignOpen()}
            type="button"
          >
            {workspace.campaign.joinEnabled ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
          </button>
          <button className="icon-button" aria-label="Campaign settings" title="Campaign settings" onClick={() => setSettingsOpen(true)} type="button"><Settings2 aria-hidden="true" /></button>
        </div>
      </header>

      <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><div className="dialog-heading"><div><Dialog.Title>Campaign settings</Dialog.Title><Dialog.Description>Rename this campaign or update the description shown to players.</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Close"><X aria-hidden="true" /></Dialog.Close></div><form className="stack-form" onSubmit={saveCampaignSettings}><label>Campaign name<input maxLength={80} minLength={2} required value={campaignDraft.name} onChange={(event) => setCampaignDraft({ ...campaignDraft, name: event.target.value })} /></label><label>Description<textarea maxLength={500} rows={4} value={campaignDraft.description} onChange={(event) => setCampaignDraft({ ...campaignDraft, description: event.target.value })} /></label><button className="button primary-button" type="submit">Save campaign</button></form></Dialog.Content></Dialog.Portal>
      </Dialog.Root>

      <div className="workspace-body">
        <aside className="location-rail">
          <div className="rail-heading">
            <span>World locations</span>
            <button
              className="icon-button"
              aria-label="Add world location"
              title="Add location"
              onClick={() => setLocationDialog(true)}
              type="button"
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <nav>
            {workspace.locations.map((location) => (
              <button
                className={`${location.sceneId === sceneId ? "active" : ""} ${location.revealed ? "" : "unrevealed"}`}
                key={location.id}
                onClick={() => {
                  setSelectedLocationId(location.id);
                  setSceneId(location.sceneId);
                }}
                onDoubleClick={() => openLocation(location)}
                type="button"
              >
                <Map aria-hidden="true" />
                <span>
                  <strong>{location.name}</strong>
                  <small>{location.revealed ? "Revealed" : "DM only"}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="player-roster">
            <div className="rail-heading">
              <span>Players</span>
              <b>{workspace.players.length}</b>
            </div>
            {workspace.players.length ? (
              workspace.players.map((player) => (
                <label key={player.id}>
                  <input
                    checked={selectedPlayers.has(player.id)}
                    onChange={(event) =>
                      setSelectedPlayers((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(player.id);
                        else next.delete(player.id);
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  <span className="avatar small" style={{ backgroundColor: player.color }}>
                    {player.avatarAssetId ? <Image alt="" height={28} src={`/api/v1/assets/${player.avatarAssetId}`} unoptimized width={28} /> : player.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{player.nickname}</strong>
                    <small>{playerDestinationLabel(player, workspace.scenes)}</small>
                  </span>
                </label>
              ))
            ) : (
              <p className="rail-empty">No players connected</p>
            )}
            {workspace.players.length ? (
              <div className="destination-actions">
                <button
                  disabled={!selectedIds.length || !activeScene}
                  onClick={() =>
                    activeScene && void setDestination(selectedIds, { kind: "scene", sceneId: activeScene.id })
                  }
                  type="button"
                >
                  Send selected
                </button>
                <button
                  disabled={!activeScene}
                  onClick={() =>
                    activeScene &&
                    void setDestination(
                      workspace.players.map((player) => player.id),
                      { kind: "scene", sceneId: activeScene.id }
                    )
                  }
                  type="button"
                >
                  Send all
                </button>
                <button
                  disabled={!selectedIds.length}
                  onClick={() => void setDestination(selectedIds, { kind: "world" })}
                  type="button"
                >
                  Return to world
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="workspace-stage">
          {activeView === "world" ? (
            <WorldCanvas
              campaignId={campaignId}
              connections={workspace.connections}
              editable
              locations={workspace.locations}
              worldMap={workspace.worldMap}
              onChanged={() => {
                realtimeSocket().emit("campaign:changed", { campaignId });
                void load();
              }}
              onCreateLocation={() => setLocationDialog(true)}
              onOpenScene={openLocation}
              onSelectLocation={(location) => setSelectedLocationId(location.id)}
            />
          ) : activeScene && actor ? (
            <>
              <nav className="battle-mode-nav" aria-label="DM battle modes">
                <button className={battleMode === "table" ? "active" : ""} onClick={() => setBattleMode("table")} type="button"><Table2 aria-hidden="true" /> Table</button>
                <button className={battleMode === "combat" ? "active" : ""} onClick={() => setBattleMode("combat")} type="button"><Swords aria-hidden="true" /> Combat</button>
                <button className={battleMode === "build" ? "active" : ""} onClick={() => setBattleMode("build")} type="button"><Hammer aria-hidden="true" /> Build</button>
                <button className={battleMode === "library" ? "active" : ""} onClick={() => setBattleMode("library")} type="button"><Library aria-hidden="true" /> Library</button>
              </nav>
              <BattleCanvas
                actor={actor}
                mode={battleMode}
                onCommand={command}
                onMove={moveToken}
                onSelect={setSelectedTokenId}
                onUndo={undo}
                onZoom={setZoom}
                scene={activeScene}
                selectedTokenId={selectedTokenId}
                zoom={zoom}
              />
              {battleMode === "table" || battleMode === "combat" ? (
                <DiceTray campaignId={campaignId} sceneId={activeScene.id} />
              ) : null}
            </>
          ) : (
            <div className="loading-state">
              <span className="spinner" /> Joining encounter...
            </div>
          )}
        </section>

        {activeView === "battle" && activeScene ? (
          <EncounterInspector
            campaignId={campaignId}
            mode={battleMode}
            onCommand={command}
            onCreateToken={createToken}
            onSelectToken={setSelectedTokenId}
            players={workspace.players}
            scene={activeScene}
            selectedToken={selectedToken}
          />
        ) : (
          <aside className="campaign-inspector world-inspector">
            <WorldMapEditor
              campaignId={campaignId}
              onChanged={(worldMap) => {
                setWorkspace((current) => (current ? { ...current, worldMap } : current));
                realtimeSocket().emit("campaign:changed", { campaignId });
              }}
              settings={workspace.worldMap}
            />
            {selectedLocation ? (
              <section className="inspector-section">
                <div className="inspector-heading">
                  <div>
                    <small>World location</small>
                    <h2>{selectedLocation.name}</h2>
                  </div>
                  <Map aria-hidden="true" />
                </div>
                <label>
                  Name
                  <input
                    defaultValue={selectedLocation.name}
                    key={`${selectedLocation.id}-name`}
                    onBlur={(event) => void updateLocation(selectedLocation, { name: event.target.value })}
                  />
                </label>
                <label>
                  Notes
                  <textarea
                    defaultValue={selectedLocation.description}
                    key={`${selectedLocation.id}-notes`}
                    onBlur={(event) => void updateLocation(selectedLocation, { description: event.target.value })}
                    rows={5}
                  />
                </label>
                <label className="toggle-row">
                  <input
                    checked={selectedLocation.revealed}
                    onChange={(event) => void updateLocation(selectedLocation, { revealed: event.target.checked })}
                    type="checkbox"
                  />
                  <span>Visible to players</span>
                </label>
                <button
                  className="button primary-button wide"
                  onClick={() => openLocation(selectedLocation)}
                  type="button"
                >
                  <Swords aria-hidden="true" /> Open battle scene
                </button>
              </section>
            ) : (
              <section className="inspector-section selection-empty">
                <Settings2 aria-hidden="true" />
                <h2>Campaign overview</h2>
                <dl className="overview-list">
                  <div>
                    <dt>Locations</dt>
                    <dd>{workspace.locations.length}</dd>
                  </div>
                  <div>
                    <dt>Players</dt>
                    <dd>{workspace.players.length}</dd>
                  </div>
                  <div>
                    <dt>Open scenes</dt>
                    <dd>{workspace.scenes.length}</dd>
                  </div>
                </dl>
              </section>
            )}
          </aside>
        )}
      </div>

      <AudioDock
        campaignId={campaignId}
        isDM
        onTracksChanged={() => void audioTracksChanged()}
        state={workspace.audioState}
        tracks={workspace.audioTracks}
      />

      <Dialog.Root open={locationDialog} onOpenChange={setLocationDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <div className="dialog-heading">
              <div>
                <Dialog.Title>Add world location</Dialog.Title>
                <Dialog.Description>Each location owns one battle scene.</Dialog.Description>
              </div>
              <Dialog.Close className="icon-button" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <form className="stack-form" onSubmit={createLocation}>
              <label>
                Name
                <input
                  autoFocus
                  maxLength={80}
                  required
                  value={locationDraft.name}
                  onChange={(event) => setLocationDraft({ ...locationDraft, name: event.target.value })}
                />
              </label>
              <label>
                Notes
                <textarea
                  maxLength={500}
                  rows={4}
                  value={locationDraft.description}
                  onChange={(event) => setLocationDraft({ ...locationDraft, description: event.target.value })}
                />
              </label>
              <label className="toggle-row">
                <input
                  checked={locationDraft.revealed}
                  onChange={(event) => setLocationDraft({ ...locationDraft, revealed: event.target.checked })}
                  type="checkbox"
                />
                <span>Reveal to players now</span>
              </label>
              <button className="button primary-button wide" type="submit">
                <Plus aria-hidden="true" /> Add location
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {error ? (
        <button className="workspace-error" onClick={() => setError("")} type="button">
          {error}
          <X aria-hidden="true" />
        </button>
      ) : null}
    </main>
  );
}
