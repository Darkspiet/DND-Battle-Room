import type { AudioPlaybackState } from "./types";

export function effectiveAudioPosition(state: AudioPlaybackState, now = Date.now()) {
  if (!state.playing || !state.startedAt) return state.positionMs;
  return Math.max(0, state.positionMs + now - new Date(state.startedAt).getTime());
}
