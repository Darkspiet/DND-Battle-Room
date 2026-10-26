"use client";

/* eslint-disable @next/next/no-img-element -- natural image pixels are required for grid calibration */

import {
  Crosshair,
  ExternalLink,
  Grid3X3,
  ImageOff,
  Link2,
  RefreshCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, errorMessage } from "../../lib/client/api";
import { calibrationFromPoints, normalizeCalibration, type CalibrationPoint } from "../../lib/domain/gridCalibration";
import { detectPrintedGrid } from "../../lib/domain/gridDetection";
import type { SceneCommand, SceneGrid } from "../../lib/domain/types";

type Props = {
  campaignId: string;
  grid: SceneGrid;
  onCommand: (command: SceneCommand) => Promise<void>;
};

export function MapCalibration({ campaignId, grid, onCommand }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewImageRef = useRef<HTMLImageElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const syncedGridRef = useRef(grid);
  const detectedAssetRef = useRef<string | null>(null);
  const calibration = grid.calibration ?? {
    originX: 0,
    originY: 0,
    pixelsPerCell: grid.cellSize,
    imageScale: 1,
    imageOffsetX: 0,
    imageOffsetY: 0
  };
  const [draft, setDraft] = useState({ ...calibration, rows: grid.rows, columns: grid.columns });
  const [assetId, setAssetId] = useState<string | null>(grid.backgroundAssetId ?? null);
  const [appearance, setAppearance] = useState({
    feetPerCell: grid.feetPerCell,
    backgroundOpacity: grid.backgroundOpacity ?? 0.96,
    showGrid: grid.showGrid ?? true,
    color: grid.color,
    backgroundColor: grid.backgroundColor
  });
  const [url, setUrl] = useState("");
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [previewWidth, setPreviewWidth] = useState(300);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [cellsBetweenPoints, setCellsBetweenPoints] = useState(1);
  const [detectionMessage, setDetectionMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Room snapshots also arrive for token/dice changes. Do not erase an
    // unfinished calibration merely because its unchanged grid is a new object.
    if (JSON.stringify(syncedGridRef.current) === JSON.stringify(grid)) return;
    const mapChanged = syncedGridRef.current.backgroundAssetId !== grid.backgroundAssetId;
    syncedGridRef.current = grid;
    const next = grid.calibration ?? {
      originX: 0,
      originY: 0,
      pixelsPerCell: grid.cellSize,
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0
    };
    setDraft({ ...next, rows: grid.rows, columns: grid.columns });
    setAssetId(grid.backgroundAssetId ?? null);
    setAppearance({
      feetPerCell: grid.feetPerCell,
      backgroundOpacity: grid.backgroundOpacity ?? 0.96,
      showGrid: grid.showGrid ?? true,
      color: grid.color,
      backgroundColor: grid.backgroundColor
    });
    setPoints([]);
    setDetectionMessage("");
    if (mapChanged) {
      setPreviewZoom(1);
      detectedAssetRef.current = null;
    }
  }, [grid]);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [assetId]);

  function zoomPreview(nextZoom: number) {
    const viewport = previewViewportRef.current;
    const next = Math.max(1, Math.min(8, nextZoom));
    const ratio = next / previewZoom;
    const left = viewport ? (viewport.scrollLeft + viewport.clientWidth / 2) * ratio - viewport.clientWidth / 2 : 0;
    const top = viewport ? (viewport.scrollTop + viewport.clientHeight / 2) * ratio - viewport.clientHeight / 2 : 0;
    setPreviewZoom(next);
    requestAnimationFrame(() => viewport?.scrollTo({ left: next === 1 ? 0 : left, top: next === 1 ? 0 : top }));
  }

  function detectGrid(image = previewImageRef.current) {
    if (!image?.naturalWidth || !image.naturalHeight) return;
    try {
      const scale = Math.min(1, 4096 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Image analysis is unavailable; use the two-point alignment.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const detected = detectPrintedGrid(context.getImageData(0, 0, canvas.width, canvas.height));
      if (!detected) {
        setDetectionMessage("No reliable square grid found. Zoom in and choose two grid intersections below.");
        return;
      }
      const pixelsPerCell = Math.round((detected.pixelsPerCell / scale) * 1000) / 1000;
      setDraft({
        ...detected,
        originX: detected.originX / scale,
        originY: detected.originY / scale,
        pixelsPerCell,
        imageScale: Math.max(0.05, Math.min(10, grid.cellSize / pixelsPerCell)),
        imageOffsetX: 0,
        imageOffsetY: 0
      });
      setPoints([]);
      setError("");
      setDetectionMessage(
        `Printed grid found: ${detected.columns} × ${detected.rows} cells, ${pixelsPerCell.toFixed(2)} image pixels per cell. Review the preview, then apply.`
      );
    } catch (caught) {
      setDetectionMessage(errorMessage(caught));
    }
  }

  const previewLines = useMemo(() => {
    if (!imageSize.width || !imageSize.height) return { vertical: [], horizontal: [] };
    return {
      vertical: Array.from({ length: draft.columns + 1 }, (_, index) => draft.originX + index * draft.pixelsPerCell)
        .filter((value) => value >= 0 && value <= imageSize.width)
        .map((value) => (value / imageSize.width) * 100),
      horizontal: Array.from({ length: draft.rows + 1 }, (_, index) => draft.originY + index * draft.pixelsPerCell)
        .filter((value) => value >= 0 && value <= imageSize.height)
        .map((value) => (value / imageSize.height) * 100)
    };
  }, [draft.columns, draft.originX, draft.originY, draft.pixelsPerCell, draft.rows, imageSize]);

  function number(key: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [key]: Number(value) }));
  }

  async function upload(file: File | null) {
    if (!file) return;
    setPending(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "map");
      form.set("campaignId", campaignId);
      const result = await apiFetch<{ asset: { id: string } }>("/api/v1/assets", { method: "POST", body: form });
      await onCommand({
        type: "grid.update",
        patch: { backgroundAssetId: result.asset.id, calibration: null, showGrid: false }
      });
      setAssetId(result.asset.id);
      setPoints([]);
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
        body: JSON.stringify({ url: url.trim(), kind: "map", campaignId })
      });
      await onCommand({
        type: "grid.update",
        patch: { backgroundAssetId: asset.id, calibration: null, showGrid: false }
      });
      setAssetId(asset.id);
      setPoints([]);
      setUrl("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    setPending(true);
    setError("");
    try {
      const aligned = normalizeCalibration(draft);
      await onCommand({
        type: "grid.update",
        patch: {
          rows: draft.rows,
          columns: draft.columns,
          cellSize: aligned.cellSize,
          backgroundAssetId: assetId,
          feetPerCell: appearance.feetPerCell,
          backgroundOpacity: appearance.backgroundOpacity,
          showGrid: appearance.showGrid,
          color: appearance.color,
          backgroundColor: appearance.backgroundColor,
          calibration: aligned.calibration
        }
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function selectCalibrationPoint(event: MouseEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const bounds = image.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * image.naturalWidth,
      y: ((event.clientY - bounds.top) / bounds.height) * image.naturalHeight
    };
    const next = points.length >= 2 ? [point] : [...points, point];
    setPoints(next);
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    alignPoints(next, cellsBetweenPoints, { width: image.naturalWidth, height: image.naturalHeight });
  }

  function alignPoints(next: CalibrationPoint[], span: number, size = imageSize) {
    if (next.length === 2) {
      try {
        const aligned = calibrationFromPoints(next[0], next[1], size, span);
        setDraft((current) => ({
          ...current,
          ...aligned,
          imageScale: Math.max(0.05, Math.min(10, grid.cellSize / aligned.pixelsPerCell))
        }));
        setError("");
        setDetectionMessage("Manual alignment ready. Check the preview, then apply.");
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }
  }

  return (
    <section className="calibration-panel">
      <div className="panel-title">
        <span className="section-icon">
          <Grid3X3 aria-hidden="true" />
        </span>
        <div>
          <h3>Imported map grid</h3>
        </div>
      </div>
      <a className="text-link" href="https://infinity.arcanecollector.com/" rel="noreferrer" target="_blank">
        Build at Infinity Arcane Collector <ExternalLink aria-hidden="true" />
      </a>
      <input
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Battle map image file"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
      <button
        className="button secondary-button wide"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Upload aria-hidden="true" /> {assetId ? "Replace downloaded map" : "Import downloaded map"}
      </button>
      <form className="inline-import" onSubmit={importUrl}>
        <input
          aria-label="Battle map image URL"
          placeholder="https://..."
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Import battle map URL"
          disabled={pending || !url.trim()}
          title="Import URL"
          type="submit"
        >
          <Link2 aria-hidden="true" />
        </button>
      </form>
      {assetId ? (
        <div className="calibration-preview">
          <div className="calibration-preview-heading">
            <span>
              <Crosshair aria-hidden="true" /> 2-point auto align
            </span>
            <b>{points.length}/2</b>
            {points.length ? (
              <button
                className="icon-button"
                aria-label="Clear calibration points"
                onClick={() => setPoints([])}
                title="Clear points"
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <div className="calibration-zoom-controls">
            <button
              className="icon-button"
              type="button"
              aria-label="Zoom calibration out"
              disabled={previewZoom <= 1}
              onClick={() => zoomPreview(previewZoom / 2)}
            >
              <ZoomOut aria-hidden="true" />
            </button>
            <button
              className="button ghost-button"
              type="button"
              aria-label="Fit calibration preview"
              onClick={() => zoomPreview(1)}
            >
              {Math.round(previewZoom * 100)}%
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Zoom calibration in"
              disabled={previewZoom >= 8}
              onClick={() => zoomPreview(previewZoom * 2)}
            >
              <ZoomIn aria-hidden="true" />
            </button>
            <button
              className="button secondary-button"
              type="button"
              disabled={pending || !imageSize.width}
              onClick={() => detectGrid()}
            >
              Detect printed grid
            </button>
          </div>
          <p className="calibration-help">
            Zoom and scroll to pick two intersections on the same row or column. For greater precision, select a wider
            span and enter the number of cells between the points.
          </p>
          <label className="calibration-span">
            Cells between points
            <input
              type="number"
              min={1}
              max={200}
              value={cellsBetweenPoints}
              onChange={(event) => {
                const span = Number(event.target.value);
                setCellsBetweenPoints(span);
                alignPoints(points, span);
              }}
            />
          </label>
          {detectionMessage ? (
            <p className="calibration-help" role="status">
              {detectionMessage}
            </p>
          ) : null}
          <div className="calibration-viewport" ref={previewViewportRef}>
            <div
              className="calibration-image-wrap"
              style={{
                width:
                  (imageSize.height
                    ? Math.min(previewWidth, (260 * imageSize.width) / imageSize.height)
                    : previewWidth) * previewZoom
              }}
            >
              <img
                ref={previewImageRef}
                alt="Battle map grid calibration preview"
                draggable={false}
                onClick={selectCalibrationPoint}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
                  if (!grid.calibration && detectedAssetRef.current !== assetId) {
                    detectedAssetRef.current = assetId;
                    detectGrid(image);
                  }
                }}
                src={`/api/v1/assets/${assetId}`}
              />
              <div className="calibration-line-overlay" aria-hidden="true">
                {previewLines.vertical.map((left) => (
                  <span className="vertical" key={`v-${left}`} style={{ left: `${left}%` }} />
                ))}
                {previewLines.horizontal.map((top) => (
                  <span className="horizontal" key={`h-${top}`} style={{ top: `${top}%` }} />
                ))}
                {points.map((point, index) => (
                  <i
                    key={`${point.x}-${point.y}`}
                    style={{
                      left: `${(point.x / imageSize.width) * 100}%`,
                      top: `${(point.y / imageSize.height) * 100}%`
                    }}
                  >
                    {index + 1}
                  </i>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <details className="calibration-advanced">
        <summary>Manual grid settings</summary>
        <div className="calibration-grid">
          <label>
            Columns
            <input
              min={4}
              max={200}
              type="number"
              value={draft.columns}
              onChange={(event) => number("columns", event.target.value)}
            />
          </label>
          <label>
            Rows
            <input
              min={4}
              max={200}
              type="number"
              value={draft.rows}
              onChange={(event) => number("rows", event.target.value)}
            />
          </label>
          <label>
            Grid pixels
            <input
              min={2}
              max={1000}
              step="any"
              type="number"
              value={draft.pixelsPerCell}
              onChange={(event) => number("pixelsPerCell", event.target.value)}
            />
          </label>
          <label>
            Image scale
            <input
              min={0.05}
              max={10}
              step={0.05}
              type="number"
              value={draft.imageScale}
              onChange={(event) => number("imageScale", event.target.value)}
            />
          </label>
          <label>
            First line X
            <input
              step={1}
              type="number"
              value={draft.originX}
              onChange={(event) => number("originX", event.target.value)}
            />
          </label>
          <label>
            First line Y
            <input
              step={1}
              type="number"
              value={draft.originY}
              onChange={(event) => number("originY", event.target.value)}
            />
          </label>
          <label>
            Image offset X
            <input
              step={1}
              type="number"
              value={draft.imageOffsetX}
              onChange={(event) => number("imageOffsetX", event.target.value)}
            />
          </label>
          <label>
            Image offset Y
            <input
              step={1}
              type="number"
              value={draft.imageOffsetY}
              onChange={(event) => number("imageOffsetY", event.target.value)}
            />
          </label>
        </div>
        <div className="calibration-grid">
          <label>
            Feet per cell
            <input
              min={1}
              max={100}
              type="number"
              value={appearance.feetPerCell}
              onChange={(event) => setAppearance({ ...appearance, feetPerCell: Number(event.target.value) })}
            />
          </label>
          <label>
            Image opacity
            <input
              min={0.05}
              max={1}
              step={0.05}
              type="range"
              value={appearance.backgroundOpacity}
              onChange={(event) => setAppearance({ ...appearance, backgroundOpacity: Number(event.target.value) })}
            />
          </label>
          <label>
            Grid color
            <input
              type="color"
              value={appearance.color.startsWith("#") ? appearance.color : "#d7d2c7"}
              onChange={(event) => setAppearance({ ...appearance, color: event.target.value })}
            />
          </label>
          <label>
            Ground color
            <input
              type="color"
              value={appearance.backgroundColor}
              onChange={(event) => setAppearance({ ...appearance, backgroundColor: event.target.value })}
            />
          </label>
        </div>
      </details>
      <label className="toggle-row">
        <input
          checked={appearance.showGrid}
          onChange={(event) => setAppearance({ ...appearance, showGrid: event.target.checked })}
          type="checkbox"
        />
        <span>Show grid</span>
      </label>
      <button className="button primary-button wide" disabled={pending} onClick={() => void apply()} type="button">
        Apply grid alignment
      </button>
      {assetId ? (
        <div className="button-row">
          <button
            className="button secondary-button"
            disabled={pending}
            onClick={() => {
              setDraft((current) => ({
                ...current,
                imageScale: 1,
                imageOffsetX: 0,
                imageOffsetY: 0,
                originX: 0,
                originY: 0
              }));
              setAppearance((current) => ({ ...current, backgroundOpacity: 0.96 }));
            }}
            type="button"
          >
            <RefreshCcw aria-hidden="true" /> Reset
          </button>
          <button
            className="button danger-button"
            disabled={pending}
            onClick={() => {
              setAssetId(null);
              void onCommand({
                type: "grid.update",
                patch: { backgroundAssetId: null, calibration: null, showGrid: true }
              });
            }}
            type="button"
          >
            <ImageOff aria-hidden="true" /> Remove
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
