import {
  cacheYoutubeAudio,
  getYoutubeAudioCacheStatus,
  convertFileSrc,
  type YoutubeAudioCacheOptions,
} from "@/commands";
import type { StreamOption } from "@/types/youtube";

export interface YoutubeAudioToLocalOptions {
  url: string;
  audioStream: StreamOption;
  proxy?: string;
}

export interface YoutubeAudioToLocalResult {
  localUrl: string;
  cached: boolean;
  fileSize: number;
}

export async function youtubeAudioToLocal(
  options: YoutubeAudioToLocalOptions,
  onProgress?: (progress: any) => void,
): Promise<YoutubeAudioToLocalResult> {
  const { url } = options;

  try {
    const cacheStatus = await getYoutubeAudioCacheStatus(url);

    if (cacheStatus) {
      const localUrl = await convertFileSrc(cacheStatus.localPath);
      return {
        localUrl,
        cached: true,
        fileSize: cacheStatus.fileSize,
      };
    }

    const cacheOptions: YoutubeAudioCacheOptions = {
      url: options.url,
      audioStream: options.audioStream,
      proxy: options.proxy,
    };

    const cacheResult = await cacheYoutubeAudio(cacheOptions, onProgress);
    const localUrl = await convertFileSrc(cacheResult.localPath);

    return {
      localUrl,
      cached: false,
      fileSize: cacheResult.fileSize,
    };
  } catch (error) {
    throw new Error(
      `YouTube 音频缓存失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function isYoutubeAudioCached(url: string): Promise<boolean> {
  try {
    const status = await getYoutubeAudioCacheStatus(url);
    return status !== null;
  } catch {
    return false;
  }
}
