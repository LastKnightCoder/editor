export interface YoutubeVideoInfo {
  url: string;
  audioStreams: StreamOption[];
  videoStreams: StreamOption[];
  title: string;
  thumbnail?: string;
  duration?: number;
}

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
