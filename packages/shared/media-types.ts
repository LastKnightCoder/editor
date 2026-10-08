export interface StreamOption {
  id: string;
  resolution: string;
  format: string;
  fps?: number;
  codecs?: string;
  bitrate?: number;
  size?: string;
  videoOnly: boolean;
  audioOnly: boolean;
}
export type WebLinkSourceType = "remote" | "local";
