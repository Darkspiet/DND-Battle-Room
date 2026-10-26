"use client";

import { ExternalLink, Link as LinkIcon, Music2, Pause, Play, Repeat2, Upload, Volume2, VolumeX } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { emitWithAck } from "../../lib/client/realtime";
import type { AudioPlaybackState, AudioTrack } from "../../lib/domain/types";
import { effectiveAudioPosition } from "../../lib/domain/audio";

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type Props = {
  campaignId: string;
  isDM: boolean;
  state: AudioPlaybackState;
  tracks: AudioTrack[];
  onTracksChanged?: () => void;
};

export function AudioDock({ campaignId, isDM, state, tracks, onTracksChanged }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(state.positionMs);
  const [volume, setVolume] = useState(0.8);
  const [previousVolume, setPreviousVolume] = useState(0.8);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ title: "", externalUrl: "", provider: "Bardy / streaming" });
  const [error, setError] = useState("");
  const activeTrack = tracks.find((track) => track.id === state.trackId) ?? null;
  const localSource = activeTrack?.assetId ? `/api/v1/assets/${activeTrack.assetId}` : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !localSource) return;
    const targetSeconds = effectiveAudioPosition(state) / 1000;
    if (Number.isFinite(targetSeconds) && Math.abs(audio.currentTime - targetSeconds) > 1.5)
      audio.currentTime = targetSeconds;
    audio.loop = state.loop;
    if (state.playing && enabled) void audio.play().catch(() => setEnabled(false));
    else audio.pause();
  }, [enabled, localSource, state]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [localSource, volume]);

  async function setPlayback(patch: Partial<AudioPlaybackState>) {
    try {
      await emitWithAck("audio:set", {
        campaignId,
        ...(patch.trackId !== undefined ? { trackId: patch.trackId } : {}),
        ...(patch.playing !== undefined ? { playing: patch.playing } : {}),
        ...(patch.positionMs !== undefined ? { positionMs: patch.positionMs } : {}),
        ...(patch.loop !== undefined ? { loop: patch.loop } : {})
      });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function togglePlayback() {
    if (!state.playing) setEnabled(true);
    await setPlayback({ playing: !state.playing });
  }

  async function commitSeek() {
    const nextPosition = audioRef.current ? Math.floor(audioRef.current.currentTime * 1000) : positionMs;
    await setPlayback({ positionMs: nextPosition });
  }

  function seekLocally(nextPosition: number) {
    setPositionMs(nextPosition);
    if (audioRef.current) audioRef.current.currentTime = nextPosition / 1000;
  }

  function toggleMute() {
    if (volume > 0) {
      setPreviousVolume(volume);
      setVolume(0);
    } else {
      setVolume(previousVolume || 0.8);
    }
  }

  async function upload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("kind", "audio");
      form.set("campaignId", campaignId);
      form.set("file", file);
      const { asset } = await apiFetch<{ asset: { id: string } }>("/api/v1/assets", { method: "POST", body: form });
      await apiFetch(`/api/v1/campaigns/${campaignId}/audio`, {
        method: "POST",
        body: JSON.stringify({ action: "track", title: file.name.replace(/\.[^.]+$/, ""), assetId: asset.id })
      });
      onTracksChanged?.();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }


  }

  async function addExternal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiFetch(`/api/v1/campaigns/${campaignId}/audio`, {
        method: "POST",
        body: JSON.stringify({ action: "track", ...linkDraft })
      });
      setLinkDraft({ title: "", externalUrl: "", provider: "Bardy / streaming" });
      setLinkOpen(false);
      onTracksChanged?.();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <section className="audio-dock" aria-label="Campaign audio">
      {localSource ? (
        <audio
          key={localSource}
          onDurationChange={(event) =>
            setDurationMs(
              Number.isFinite(event.currentTarget.duration) ? Math.floor(event.currentTarget.duration * 1000) : 0
            )
          }
          onTimeUpdate={(event) => setPositionMs(Math.floor(event.currentTarget.currentTime * 1000))}
          ref={audioRef}
          src={localSource}
          preload="metadata"
        />
      ) : null}
      <div className="audio-now">
        <span className="section-icon">
          <Music2 aria-hidden="true" />
        </span>
        <div>
          <small>Campaign audio</small>
          <strong>{activeTrack?.title ?? "No track selected"}</strong>
        </div>
      </div>
      {isDM ? (
        <>
          <select
            aria-label="Audio track"
            value={state.trackId ?? ""}
            onChange={(event) =>
              void setPlayback({ trackId: event.target.value || null, playing: false, positionMs: 0 })
            }
          >
            <option value="">Choose a track</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title}
              </option>
            ))}
          </select>
          {localSource ? (
            <div className="audio-seek">
              <input
                aria-label="Audio position"
                disabled={!durationMs}
                max={Math.max(durationMs, 1)}
                min={0}
                onBlur={() => void commitSeek()}
                onChange={(event) => seekLocally(Number(event.target.value))}
                onKeyUp={() => void commitSeek()}
                onPointerUp={() => void commitSeek()}
                step={250}
                type="range"
                value={Math.min(positionMs, Math.max(durationMs, 1))}
              />
              <output>
                {formatTime(positionMs)} / {formatTime(durationMs)}
              </output>
            </div>
          ) : null}
          <button
            className="icon-button"
            aria-label={state.playing ? "Pause campaign audio" : "Play campaign audio"}
            title={state.playing ? "Pause" : "Play"}
            disabled={!localSource}
            onClick={() => void togglePlayback()}
            type="button"
          >
            {state.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button
            className={state.loop ? "icon-button active" : "icon-button"}
            aria-label={state.loop ? "Disable audio loop" : "Loop campaign audio"}
            title={state.loop ? "Disable loop" : "Loop track"}
            disabled={!localSource}
            onClick={() => void setPlayback({ loop: !state.loop })}
            type="button"
          >
            <Repeat2 aria-hidden="true" />
          </button>
          <input
            accept="audio/mpeg,audio/ogg,audio/webm,audio/wav"
            className="sr-only"
            onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            ref={fileRef}
            type="file"
          />
          <button
            className="icon-button"
            aria-label="Upload local audio"
            title="Upload local audio"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Add external audio link"
            title="Add Bardy or streaming link"
            onClick={() => setLinkOpen((value) => !value)}
            type="button"
          >
            <LinkIcon aria-hidden="true" />
          </button>
        </>
      ) : localSource && !enabled ? (
        <button
          className="button secondary-button compact"
          onClick={() => {
            setEnabled(true);
            if (audioRef.current) {
              audioRef.current.currentTime = effectiveAudioPosition(state) / 1000;
              void audioRef.current.play();
            }
          }}
          type="button"
        >
          <Play aria-hidden="true" /> Enable sound
        </button>
      ) : localSource ? (
        <div className="audio-volume">
          <button
            className="icon-button quiet"
            aria-label={volume ? "Mute campaign audio" : "Unmute campaign audio"}
            title={volume ? "Mute" : "Unmute"}
            onClick={toggleMute}
            type="button"
          >
            {volume ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          </button>
          <input
            aria-label="Personal audio volume"
            max={1}
            min={0}
            onChange={(event) => setVolume(Number(event.target.value))}
            step={0.05}
            type="range"
            value={volume}
          />
        </div>
      ) : null}
      {activeTrack?.externalUrl ? (
        <a
          className="icon-button"
          aria-label="Open external music player"
          title={`Open ${activeTrack.provider ?? "external player"}`}
          href={activeTrack.externalUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" />
        </a>
      ) : null}
      {linkOpen ? (
        <form className="audio-link-form" onSubmit={addExternal}>
          <input
            aria-label="Track title"
            placeholder="Track title"
            required
            value={linkDraft.title}
            onChange={(event) => setLinkDraft({ ...linkDraft, title: event.target.value })}
          />
          <input
            aria-label="External URL"
            placeholder="https://..."
            required
            type="url"
            value={linkDraft.externalUrl}
            onChange={(event) => setLinkDraft({ ...linkDraft, externalUrl: event.target.value })}
          />
          <button className="button secondary-button compact" type="submit">
            Add
          </button>
        </form>
      ) : null}
      {error ? (
        <p className="audio-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
