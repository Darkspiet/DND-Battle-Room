"use client";

import { Dices, Globe2, LoaderCircle, Radio, Send, Swords } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { emitWithAck, realtimeSocket } from "../../lib/client/realtime";
import { createUuid } from "../../lib/domain/id";
import type {
  Actor,
  AudioPlaybackState,
  AudioTrack,
  CampaignPlayer,
  InitiativeEntry,
  InitiativeRollMode,
  SceneCommand,
  SceneRecord,
  SceneToken,
  WorldConnection,
  WorldLocation,
  WorldMapSettings
} from "../../lib/domain/types";
import { PlayerTokenControls } from "./PlayerTokenControls";
import { AudioDock } from "./AudioDock";
import { BattleCanvas } from "./BattleCanvas";
import { DiceTray } from "./DiceTray";
import { WorldCanvas } from "./WorldCanvas";

type PlayerView = {
  campaign: { id: string; name: string; description: string; joinCode: string };
  player: CampaignPlayer;
  locations: WorldLocation[];
  connections: WorldConnection[];
  worldMap: WorldMapSettings;
  scene: SceneRecord | null;
  audioTracks: AudioTrack[];
  audioState: AudioPlaybackState;
};

export function PlayerCampaign({ code }: { code: string }) {
  const router = useRouter();
  const [view, setView] = useState<PlayerView | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [zoom, setZoom] = useState(0.65);
  const [initiative, setInitiative] = useState(10);
  const [dexModifier, setDexModifier] = useState(0);
  const [rollMode, setRollMode] = useState<Exclude<InitiativeRollMode, "manual">>("normal");
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState("");
  const sceneRef = useRef<SceneRecord | null>(null);
  const committedRef = useRef<SceneRecord | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<PlayerView>(`/api/v1/join/${code}`);
      committedRef.current = data.scene;
      setView(data);
      setError("");
    } catch (caught) {
      if (caught instanceof Error && "status" in caught && caught.status === 401) router.replace(`/join/${code}`);
      else setError(errorMessage(caught));
    }
  }, [code, router]);

  useEffect(() => {
    void load();
  }, [load]);
  const campaignId = view?.campaign.id;
  const activeSceneId = view?.scene?.id;

  useEffect(() => {
    sceneRef.current = view?.scene ?? null;
  }, [view?.scene]);

  useEffect(() => {
    const socket = realtimeSocket();
    const onConnect = () => {
      setConnected(true);
      void load();
      if (campaignId)
        void emitWithAck("campaign:watch", { campaignId }).catch((caught) => setError(errorMessage(caught)));
    };
    const onDisconnect = () => {
      setConnected(false);
      setView((current) => current ? { ...current, scene: committedRef.current } : current);
      setError("Connection lost. Changes are paused until the saved state is reloaded.");
    };
    const onDestination = () => void load();
    const onChanged = () => void load();
    const onCommitted = ({ scene }: { scene: SceneRecord }) => {
      if (sceneRef.current?.id !== scene.id) return;
      committedRef.current = scene;
      sceneRef.current = scene;
      setView((current) => current ? { ...current, scene } : current);
    };
    const onPreview = (preview: { sceneId: string; tokenId: string; x: number; y: number }) =>
      setView((current) =>
        current?.scene?.id === preview.sceneId
          ? {
              ...current,
              scene: {
                ...current.scene,
                state: {
                  ...current.scene.state,
                  tokens: current.scene.state.tokens.map((token) =>
                    token.id === preview.tokenId ? { ...token, x: preview.x, y: preview.y } : token
                  )
                }
              }
            }
          : current
      );
    const onAudio = (audioState: AudioPlaybackState) =>
      setView((current) => (current ? { ...current, audioState } : current));
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("player:destination", onDestination);
    socket.on("campaign:changed", onChanged);
    socket.on("scene:committed", onCommitted);
    socket.on("token:preview", onPreview);
    socket.on("audio:state", onAudio);
    if (!socket.connected) socket.connect();
    else onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("player:destination", onDestination);
      socket.off("campaign:changed", onChanged);
      socket.off("scene:committed", onCommitted);
      socket.off("token:preview", onPreview);
      socket.off("audio:state", onAudio);
    };
  }, [campaignId, load]);

  useEffect(() => {
    if (!activeSceneId || !connected) return;
    void emitWithAck<{ actor: Actor; scene: SceneRecord }>("scene:join", { sceneId: activeSceneId })
      .then((result) => {
        setActor(result.actor);
        setView((current) => (current ? { ...current, scene: result.scene } : current));
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [activeSceneId, connected]);

  async function commitMove(token: SceneToken, x: number, y: number, preview: boolean) {
    const scene = sceneRef.current;
    if (!scene || !realtimeSocket().connected) return;
    setView((current) =>
      current?.scene
        ? {
            ...current,
            scene: {
              ...current.scene,
              state: {
                ...current.scene.state,
                tokens: current.scene.state.tokens.map((item) => (item.id === token.id ? { ...item, x, y } : item))
              }
            }
          }
        : current
    );
    if (preview) {
      realtimeSocket().volatile.emit("token:preview", {
        sceneId: scene.id,
        tokenId: token.id,
        x,
        y,
        sequence: Date.now()
      });
      return;
    }
    try {
      const { scene: updated } = await emitWithAck<{ scene: SceneRecord }>("scene:command", {
        commandId: createUuid(),
        sceneId: scene.id,
        baseVersion: scene.version,
        command: { type: "token.move", tokenId: token.id, x, y }
      });
      committedRef.current = updated;
      sceneRef.current = updated;
      setView((current) => (current ? { ...current, scene: updated } : current));
    } catch (caught) {
      setView((current) => current ? { ...current, scene: committedRef.current } : current);
      setError(errorMessage(caught));
      void load();
    }
  }

  async function tokenCommand(command: SceneCommand) {
    const scene = sceneRef.current;
    if (!scene || !realtimeSocket().connected) throw new Error("Changes are paused while disconnected.");
    try {
      const { scene: updated } = await emitWithAck<{ scene: SceneRecord }>("scene:command", {
        commandId: createUuid(), sceneId: scene.id, baseVersion: scene.version, command
      });
      committedRef.current = updated; sceneRef.current = updated;
      setView((current) => current ? { ...current, scene: updated } : current);
    } catch (caught) { void load(); throw caught; }
  }

  async function submitPlayerInitiative(entry: InitiativeEntry) {
    const scene = sceneRef.current;
    if (!scene || !actor) return;
    setError("");
    try {
      const { scene: updated } = await emitWithAck<{ scene: SceneRecord }>("combat:initiative", {
        campaignId: view?.campaign.id,
        sceneId: scene.id,
        tokenId: entry.tokenId,
        baseVersion: scene.version,
        initiative,
        dexModifier
      });
      committedRef.current = updated;
      sceneRef.current = updated;
      setView((current) => (current ? { ...current, scene: updated } : current));
    } catch (caught) {
      setView((current) => current ? { ...current, scene: committedRef.current } : current);
      setError(errorMessage(caught));
      void load();
    }
  }

  async function rollPlayerInitiative(entry: InitiativeEntry) {
    const scene = sceneRef.current;
    if (!scene || !actor) return;
    setError("");
    setRolling(true);
    try {
      const { scene: updated } = await emitWithAck<{ scene: SceneRecord }>("combat:initiative-roll", {
        campaignId: view?.campaign.id,
        sceneId: scene.id,
        tokenId: entry.tokenId,
        baseVersion: scene.version,
        dexModifier,
        mode: rollMode
      });
      committedRef.current = updated;
      sceneRef.current = updated;
      setView((current) => (current ? { ...current, scene: updated } : current));
    } catch (caught) {
      setView((current) => current ? { ...current, scene: committedRef.current } : current);
      setError(errorMessage(caught));
      void load();
    } finally {
      setRolling(false);
    }
  }

  async function uploadAvatar(file: File | null) {
    if (!file) return;
    try {
      const form = new FormData();
      form.set("file", file);
      await apiFetch("/api/v1/player/avatar", { method: "POST", body: form });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  if (!view)
    return (
      <main className="workspace-loading">
        <span className="spinner" />
        <strong>Entering campaign...</strong>
        {error ? <p className="notice error">{error}</p> : null}
      </main>
    );

  const inBattle = Boolean(view.scene && view.player.destination.kind === "scene");
  const combat = view.scene?.state.combat;
  const ownedInitiative = combat?.entries.filter((entry) => entry.ownerId === actor?.id) ?? [];
  const activeEntry = combat?.phase === "active" ? combat.entries[combat.currentTurnIndex] : null;
  return (
    <main className="player-campaign">
      <header className="player-header">
        <div className="workspace-identity">
          <span className="brand-mark">
            <Dices aria-hidden="true" />
          </span>
          <div>
            <small>{inBattle ? "Active encounter" : "Campaign world"}</small>
            <h1>{inBattle ? view.scene?.name : view.campaign.name}</h1>
          </div>
        </div>
        <div className="player-presence">
          <input accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => void uploadAvatar(event.target.files?.[0] ?? null)} ref={avatarInputRef} type="file" />
          <button className="avatar small avatar-button" onClick={() => avatarInputRef.current?.click()} style={{ backgroundColor: view.player.color }} title="Change portrait" type="button">{view.player.avatarAssetId ? <Image alt="" height={32} src={`/api/v1/assets/${view.player.avatarAssetId}`} unoptimized width={32} /> : view.player.nickname.slice(0, 1).toUpperCase()}</button>
          <strong>{view.player.nickname}</strong>
          <span className={connected ? "live-status online" : "live-status"}>
            <Radio aria-hidden="true" />
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </header>

      <section className="player-stage">
        {inBattle && view.scene && actor ? (
          <>
            <BattleCanvas
              actor={actor}
              onMove={(token, x, y, preview) => void commitMove(token, x, y, preview)}
              onSelect={setSelectedTokenId}
              onZoom={setZoom}
              scene={view.scene}
              selectedTokenId={selectedTokenId}
              zoom={zoom}
            />
            {combat?.phase === "initiative" ? (
              <div className="player-initiative initiative-prompt">
                <div className="player-initiative-title"><Swords aria-hidden="true" /><span>Roll initiative</span></div>
                {ownedInitiative.length ? ownedInitiative.map((entry) => entry.submitted ? (
                  <div className="initiative-submitted" key={entry.id}><strong>{entry.name}</strong><b>{entry.total}</b><small>Submitted</small></div>
                ) : (
                  <div className="player-initiative-form" key={entry.id}>
                    <strong>{entry.name}</strong>
                    <label>DEX<input aria-label="Dexterity modifier" min={-20} max={30} type="number" value={dexModifier} onChange={(event) => setDexModifier(Number(event.target.value))} /></label>
                    <select aria-label="Initiative roll mode" value={rollMode} onChange={(event) => setRollMode(event.target.value as Exclude<InitiativeRollMode, "manual">)}><option value="normal">Normal</option><option value="advantage">Advantage</option><option value="disadvantage">Disadvantage</option></select>
                    <button className="button primary-button" disabled={rolling} onClick={() => void rollPlayerInitiative(entry)} type="button">{rolling ? <LoaderCircle className="spin" aria-hidden="true" /> : <Dices aria-hidden="true" />} Roll</button>
                    <div className="manual-player-initiative"><input aria-label="Manual initiative total" min={-100} max={200} type="number" value={initiative} onChange={(event) => setInitiative(Number(event.target.value))} /><button className="icon-button" aria-label="Submit initiative" title="Submit manual initiative" onClick={() => void submitPlayerInitiative(entry)} type="button"><Send aria-hidden="true" /></button></div>
                  </div>
                )) : <p>The DM has not assigned a combat token to you.</p>}
              </div>
            ) : combat?.phase === "active" ? (
              <div className="player-initiative active-turn"><Swords aria-hidden="true" /><span>Round {combat.round}</span><strong>{activeEntry?.name ?? "Combat"}</strong><small>{activeEntry?.ownerId === actor.id ? "Your turn" : "Current turn"}</small></div>
            ) : null}
            <PlayerTokenControls actor={actor} tokens={view.scene.state.tokens} disabled={!connected} onCommand={tokenCommand} />
            <DiceTray campaignId={view.campaign.id} sceneId={view.scene.id} />
          </>
        ) : (
          <>
            <div className="player-world-heading">
              <Globe2 aria-hidden="true" />
              <div>
                <small>World map</small>
                <strong>{view.campaign.name}</strong>
              </div>
            </div>
            <WorldCanvas
              campaignId={view.campaign.id}
              connections={view.connections}
              editable={false}
              locations={view.locations}
              worldMap={view.worldMap}
              onOpenScene={() => undefined}
            />
          </>
        )}
      </section>

      <AudioDock campaignId={view.campaign.id} isDM={false} state={view.audioState} tracks={view.audioTracks} />
      {error ? (
        <button className="workspace-error" onClick={() => setError("")} type="button">
          {error}
        </button>
      ) : null}
    </main>
  );
}
