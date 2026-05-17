import type { RoomMember } from "./types";

export const PLAYER_COLORS = ["#e85d75", "#2fbf71", "#3d8bfd", "#f2b84b", "#9b6ef3", "#16a3a3"];

function randomHexColor() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

export function assignPlayerColor(members: RoomMember[], ignoreMemberId?: string) {
  const usedColors = new Set(
    members.filter((member) => member.id !== ignoreMemberId).map((member) => member.color.toLowerCase())
  );
  const availableColors = PLAYER_COLORS.filter((color) => !usedColors.has(color.toLowerCase()));

  if (availableColors.length) {
    return availableColors[Math.floor(Math.random() * availableColors.length)];
  }

  let color = randomHexColor();
  while (usedColors.has(color.toLowerCase())) {
    color = randomHexColor();
  }
  return color;
}

export function resolvePlayerColor(members: RoomMember[], profileId: string, currentColor?: string) {
  const normalizedCurrentColor = currentColor?.toLowerCase();
  const currentColorIsUnique =
    normalizedCurrentColor &&
    !members.some((member) => member.id !== profileId && member.color.toLowerCase() === normalizedCurrentColor);

  return currentColorIsUnique && currentColor ? currentColor : assignPlayerColor(members, profileId);
}
