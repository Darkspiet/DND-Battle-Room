import type {
  AudioPlaybackState,
  AudioTrack,
  CampaignPlayer,
  SceneRecord,
  WorldConnection,
  WorldLocation,
  WorldMapSettings
} from "../../lib/domain/types";

export type CampaignRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  joinCode: string;
  joinEnabled: boolean;
};

export type CampaignWorkspaceData = {
  campaign: CampaignRecord;
  scenes: SceneRecord[];
  locations: WorldLocation[];
  connections: WorldConnection[];
  worldMap: WorldMapSettings;
  players: CampaignPlayer[];
  audioTracks: AudioTrack[];
  audioState: AudioPlaybackState;
};
