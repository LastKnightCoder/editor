import {
  cacheBilibiliAudio,
  getBilibiliAudioCacheStatus,
  convertFileSrc,
  type BilibiliAudioCacheOptions,
} from "@/commands";

export interface BilibiliAudioToLocalOptions {
  audioUrl: string;
  bvid: string;
  cid: string;
  title?: string;
}

export interface BilibiliAudioToLocalResult {
  localUrl: string;
  cached: boolean;
  fileSize: number;
}

export async function bilibiliAudioToLocal(
  options: BilibiliAudioToLocalOptions,
  onProgress?: (progress: any) => void,
): Promise<BilibiliAudioToLocalResult> {
  const { bvid, cid } = options;

  try {
    const cacheStatus = await getBilibiliAudioCacheStatus(bvid, cid);

    if (cacheStatus) {
      const localUrl = await convertFileSrc(cacheStatus.localPath);
      return {
        localUrl,
        cached: true,
        fileSize: cacheStatus.fileSize,
      };
    }

    const cacheOptions: BilibiliAudioCacheOptions = {
      audioUrl: options.audioUrl,
      bvid: options.bvid,
      cid: options.cid,
      title: options.title,
    };

    const cacheResult = await cacheBilibiliAudio(cacheOptions, onProgress);
    const localUrl = await convertFileSrc(cacheResult.localPath);

    return {
      localUrl,
      cached: false,
      fileSize: cacheResult.fileSize,
    };
  } catch (error) {
    throw new Error(
      `Bilibili 音频缓存失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function isBilibiliAudioCached(
  bvid: string,
  cid: string,
): Promise<boolean> {
  try {
    const status = await getBilibiliAudioCacheStatus(bvid, cid);
    return status !== null;
  } catch {
    return false;
  }
}
