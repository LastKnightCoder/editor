import {
  cacheBilibiliAudio,
  cacheYoutubeAudio,
  getBilibiliAudioCacheStatus,
  getYoutubeAudioCacheStatus,
} from "@/commands";
import type { AudioMetaInfo } from "@/types";
import { checkStreamAvailability, getPlayUrl } from "@/utils/bilibili";
import type { BilibiliCredentials } from "@/utils/bilibili/types";

export interface ResolveAudioPathOptions {
  bilibiliCredentials?: BilibiliCredentials;
  youtubeProxy?: string;
}

export async function resolveAudioPathForTranscription(
  metaInfo: AudioMetaInfo,
  options: ResolveAudioPathOptions = {}
): Promise<string> {
  switch (metaInfo.type) {
    case "local":
      return metaInfo.filePath;
    case "remote":
      return metaInfo.url;
    case "xiaoyuzhou":
      return metaInfo.audioUrl || "";
    case "bilibili": {
      const cached = await getBilibiliAudioCacheStatus(metaInfo.bvid, metaInfo.cid);
      if (cached?.localPath) {
        return cached.localPath;
      }

      const playUrls = await getPlayUrl(
        metaInfo.cid,
        metaInfo.bvid,
        metaInfo.quality || 80,
        options.bilibiliCredentials
      );
      const availability = await checkStreamAvailability(playUrls);
      if (!availability.audioAvailable) {
        throw new Error("音频流不可用，可能需要大会员权限或视频已失效");
      }

      const result = await cacheBilibiliAudio({
        audioUrl: playUrls.audio,
        bvid: metaInfo.bvid,
        cid: metaInfo.cid,
        title: metaInfo.title || `${metaInfo.bvid}-${metaInfo.cid}`,
      });
      return result.localPath;
    }
    case "youtube": {
      const cached = await getYoutubeAudioCacheStatus(metaInfo.url);
      if (cached?.localPath) {
        return cached.localPath;
      }

      const result = await cacheYoutubeAudio({
        url: metaInfo.url,
        audioStream: metaInfo.audioStream,
        proxy: options.youtubeProxy,
      });
      return result.localPath;
    }
  }
}
