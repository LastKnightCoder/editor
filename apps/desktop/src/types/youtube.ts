export interface YoutubeVideoInfo {
  url: string;
  audioStreams: StreamOption[];
  videoStreams: StreamOption[];
  title: string;
  thumbnail?: string;
  duration?: number;
}

import type { StreamOption } from "@tau/shared/media-types";
export type { StreamOption } from "@tau/shared/media-types";
