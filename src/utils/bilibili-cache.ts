import {
  cacheBilibiliVideo,
  getBilibiliCacheStatus,
  convertFileSrc,
  type BilibiliCacheOptions,
  type BilibiliCacheResult,
} from "@/commands";

export interface BilibiliVideoToLocalOptions {
  videoUrl: string;
  audioUrl: string;
  bvid: string;
  cid: string;
  quality: number;
  title?: string;
}

export interface BilibiliVideoToLocalResult {
  localUrl: string;
  cached: boolean;
  fileSize: number;
}

export async function bilibiliVideoToLocal(
  options: BilibiliVideoToLocalOptions,
  onProgress?: (progress: any) => void,
): Promise<BilibiliVideoToLocalResult> {
  const { bvid, cid, quality } = options;

  try {
    // 首先检查是否已缓存
    const cacheStatus = await getBilibiliCacheStatus(bvid, cid, quality);

    if (cacheStatus) {
      // 已缓存，转换为本地 URL
      const localUrl = await convertFileSrc(cacheStatus.localPath);
      return {
        localUrl,
        cached: true,
        fileSize: cacheStatus.fileSize,
      };
    }

    // 未缓存，开始下载并缓存
    console.log(`开始缓存 Bilibili 视频: ${bvid}-${cid}-${quality}`);

    const cacheOptions: BilibiliCacheOptions = {
      videoUrl: options.videoUrl,
      audioUrl: options.audioUrl,
      bvid: options.bvid,
      cid: options.cid,
      quality: options.quality,
      title: options.title,
    };

    const cacheResult = await cacheBilibiliVideo(cacheOptions, onProgress);

    // 转换为本地 URL
    const localUrl = await convertFileSrc(cacheResult.localPath);

    console.log(`Bilibili 视频缓存完成: ${localUrl}`);

    return {
      localUrl,
      cached: false,
      fileSize: cacheResult.fileSize,
    };
  } catch (error) {
    console.error("Bilibili 视频缓存失败:", error);
    throw new Error(
      `Bilibili 视频缓存失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function isBilibiliVideoCached(
  bvid: string,
  cid: string,
  quality: number,
): Promise<boolean> {
  try {
    const cacheStatus = await getBilibiliCacheStatus(bvid, cid, quality);
    return cacheStatus !== null;
  } catch {
    return false;
  }
}

export async function getBilibiliVideoCache(
  bvid: string,
  cid: string,
  quality: number,
): Promise<BilibiliCacheResult | null> {
  try {
    return await getBilibiliCacheStatus(bvid, cid, quality);
  } catch {
    return null;
  }
}

export function generateBilibiliCacheKey(
  bvid: string,
  cid: string,
  quality: number,
): string {
  return `${bvid}-${cid}-${quality}`;
}
