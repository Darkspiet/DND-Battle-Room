"use client";
import { useState } from "react";
import { createEntityId } from "../../lib/storage";
import { prepareTokenImage } from "../../lib/tokenImages";
import type { LibraryItem, Token, TokenType } from "../../lib/types";
import type { RoomConnection } from "./useRoomConnection";
type Options = {
  connection: Pick<
    RoomConnection,
    "room" | "profile" | "isDm" | "currentMember" | "updateRoom"
  >;
};
// Token selection and drafts shared by the board, token controls and preset placement.
export function useTokens({ connection }: Options) {
  const { room, profile, isDm, currentMember, updateRoom } = connection;
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [newToken, setNewToken] = useState({
    name: "Hero",
    icon: "⚔",
    imageName: "",
    imageUrl: "",
    type: "character" as TokenType,
  });
  const [imageError, setImageError] = useState("");
  const selectedToken =
    room?.tokens.find((token) => token.id === selectedTokenId) ?? null;
  function canControl(token: Token) {
    return Boolean(profile && (isDm || token.ownerId === profile.id));
  }
  function addToken() {
    if (!profile || !room || !currentMember) return;
    const owner = currentMember;
    const token: Token = {
      id: createEntityId("token"),
      name: newToken.name.trim() || "Token",
      icon: newToken.icon.trim() || "●",
      imageName: newToken.imageName || undefined,
      imageUrl: newToken.imageUrl || undefined,
      type: newToken.type,
      ownerId: owner.id,
      ownerName: owner.nickname,
      color: owner.color,
      x: 0,
      y: 0,
      size: 1,
    };
    updateRoom((current) => ({
      ...current,
      tokens: [...current.tokens, token],
    }));
    setSelectedTokenId(token.id);
  }
  function addLibraryItem(item: LibraryItem) {
    if (!profile || !room || !currentMember) return;
    const owner = currentMember;
    const token: Token = {
      id: createEntityId(item.kind === "object" ? "object" : "token"),
      name: item.name,
      icon: item.icon || (item.kind === "object" ? "□" : "●"),
      imageName: item.imageName,
      imageUrl: item.imageUrl,
      type: item.kind === "object" ? "object" : item.tokenType,
      ownerId: owner.id,
      ownerName: owner.nickname,
      color: owner.color,
      x: 0,
      y: 0,
      size: item.size,
      hp: item.hp,
      note: item.note,
    };
    updateRoom((current) => ({
      ...current,
      tokens: [...current.tokens, token],
    }));
    setSelectedTokenId(token.id);
  }
  async function handleNewTokenImage(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      setNewToken((current) => ({ ...current, ...image }));
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Could not use that image.",
      );
    }
  }
  async function handleSelectedTokenImage(file: File | null) {
    if (!file || !selectedToken || !canControl(selectedToken)) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      updateToken(selectedToken.id, image);
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Could not use that image.",
      );
    }
  }
  function deleteToken(tokenId: string) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.filter((token) => token.id !== tokenId),
      combat: {
        ...current.combat,
        currentTurnIndex: Math.max(
          0,
          Math.min(
            current.combat.currentTurnIndex,
            Math.max(
              0,
              current.combat.entries.filter(
                (entry) => entry.tokenId !== tokenId,
              ).length - 1,
            ),
          ),
        ),
        entries: current.combat.entries.filter(
          (entry) => entry.tokenId !== tokenId,
        ),
      },
      initiative: current.initiative?.filter(
        (entry) => entry.tokenId !== tokenId,
      ),
    }));
  }
  function updateToken(tokenId: string, patch: Partial<Token>) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.map((token) =>
        token.id === tokenId && canControl(token)
          ? { ...token, ...patch }
          : token,
      ),
      combat: {
        ...current.combat,
        entries: current.combat.entries.map((entry) =>
          entry.tokenId === tokenId
            ? {
                ...entry,
                name: typeof patch.name === "string" ? patch.name : entry.name,
              }
            : entry,
        ),
      },
    }));
  }
  return {
    newToken,
    setNewToken,
    addToken,
    handleNewTokenImage,
    imageError,
    addLibraryItem,
    canControl,
    selectedToken,
    updateToken,
    handleSelectedTokenImage,
    deleteToken,
    selectedTokenId,
    setSelectedTokenId,
  };
}
export type TokenControls = ReturnType<typeof useTokens>;
