import { invoke } from "@/electron";

export interface XiaoyuzhouEpisodeInfo {
  episodeId: string;
  title?: string;
  podcastName?: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
}

export async function parseXiaoyuzhouUrl(
  url: string,
): Promise<{ episodeId: string } | null> {
  return await invoke("xiaoyuzhou:parse-url", url);
}

export async function fetchXiaoyuzhouEpisode(
  url: string,
): Promise<XiaoyuzhouEpisodeInfo | null> {
  return await invoke("xiaoyuzhou:fetch-episode", url);
}
