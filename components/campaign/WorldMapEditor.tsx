"use client";

import { ImageOff, Link2, Maximize2, RefreshCcw, Upload } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import type { WorldMapSettings } from "../../lib/domain/types";

type Props = {
  campaignId: string;
  settings: WorldMapSettings;
  onChanged: (settings: WorldMapSettings) => void;
};

export function WorldMapEditor({ campaignId, settings, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(settings);
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(settings), [settings]);

  async function patch(values: Partial<WorldMapSettings>) {
    setPending(true);
    setError("");
    try {
      const { worldMap } = await apiFetch<{ worldMap: WorldMapSettings }>(
        `/api/v1/campaigns/${campaignId}/world`,
        { method: "PATCH", body: JSON.stringify(values) }
      );
      setDraft(worldMap);
      onChanged(worldMap);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function attachAsset(assetId: string) {
    await patch({ backgroundAssetId: assetId, x: 0, y: 0, scale: 1, opacity: 1 });
  }

  async function upload(file: File | null) {
    if (!file) return;
    setPending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "world");
      form.set("campaignId", campaignId);
      const { asset } = await apiFetch<{ asset: { id: string } }>("/api/v1/assets", { method: "POST", body: form });
      await attachAsset(asset.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function importUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;
    setPending(true);
    setError("");
    try {
      const { asset } = await apiFetch<{ asset: { id: string } }>("/api/v1/assets/import-url", {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), kind: "world", campaignId })
      });
      await attachAsset(asset.id);
      setUrl("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function fitMap() {
    if (!draft.backgroundAssetId) return;
    const viewport = document.querySelector<HTMLElement>(".world-canvas");
    if (!viewport) return;
    const image = new window.Image();
    image.onload = () => {
      const scale = Math.min(viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight) * 0.9;
      void patch({
        x: (viewport.clientWidth - image.naturalWidth * scale) / 2,
        y: (viewport.clientHeight - image.naturalHeight * scale) / 2,
        scale: Math.max(0.02, Math.min(20, scale))
      });
    };
    image.onerror = () => setError("The world map could not be measured.");
    image.src = `/api/v1/assets/${draft.backgroundAssetId}`;
  }

  return (
    <section className="inspector-section world-map-editor">
      <div className="inspector-heading">
        <div>
          <small>World artwork</small>
          <h2>Map background</h2>
        </div>
        <Upload aria-hidden="true" />
      </div>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="World map image file"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
      <button className="button secondary-button wide" disabled={pending} onClick={() => inputRef.current?.click()} type="button">
        <Upload aria-hidden="true" /> {draft.backgroundAssetId ? "Replace world map" : "Upload world map"}
      </button>
      <form className="inline-import" onSubmit={importUrl}>
        <input aria-label="World map image URL" placeholder="https://..." type="url" value={url} onChange={(event) => setUrl(event.target.value)} />
        <button className="icon-button" aria-label="Import world map URL" disabled={pending || !url.trim()} title="Import URL" type="submit">
          <Link2 aria-hidden="true" />
        </button>
      </form>
      {draft.backgroundAssetId ? (
        <>
          <div className="field-pair">
            <label>
              X
              <input type="number" value={draft.x} onChange={(event) => setDraft({ ...draft, x: Number(event.target.value) })} />
            </label>
            <label>
              Y
              <input type="number" value={draft.y} onChange={(event) => setDraft({ ...draft, y: Number(event.target.value) })} />
            </label>
          </div>
          <label>
            Scale
            <input min={0.02} max={4} step={0.02} type="range" value={draft.scale} onChange={(event) => setDraft({ ...draft, scale: Number(event.target.value) })} />
          </label>
          <label>
            Opacity
            <input min={0.05} max={1} step={0.05} type="range" value={draft.opacity} onChange={(event) => setDraft({ ...draft, opacity: Number(event.target.value) })} />
          </label>
          <button className="button primary-button wide" disabled={pending} onClick={() => void patch(draft)} type="button">Apply world map</button>
          <div className="button-row">
            <button className="button secondary-button" disabled={pending} onClick={() => void fitMap()} type="button">
              <Maximize2 aria-hidden="true" /> Fit
            </button>
            <button className="button secondary-button" disabled={pending} onClick={() => void patch({ x: 0, y: 0, scale: 1, opacity: 1 })} type="button">
              <RefreshCcw aria-hidden="true" /> Reset
            </button>
            <button className="button danger-button" disabled={pending} onClick={() => void patch({ backgroundAssetId: null })} type="button">
              <ImageOff aria-hidden="true" /> Remove
            </button>
          </div>
        </>
      ) : null}
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
    </section>
  );
}
