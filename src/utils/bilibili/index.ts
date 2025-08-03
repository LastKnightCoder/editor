export * from "./types";

export {
  isBilibiliUrl,
  parseBilibiliUrl,
  bv2av,
  av2bv,
  formatDuration,
  filterTitle,
  extractInitialState,
  extractPlayInfo,
} from "./parser";

export {
  checkBilibiliLogin,
  getVideoInfoByUrl,
  getVideoInfoByBvid,
  getPlayUrl,
  getQualityInfo,
  getSubtitles,
  getBilibiliQRCode,
  checkBilibiliQRStatus,
  extractCredentialsFromQR,
  BilibiliQRCodeStatus,
} from "./api";

export {
  downloadWithProgress,
  revokeMediaUrl,
  checkStreamAvailability,
  getStreamInfo,
} from "./media";

import { parseBilibiliUrl, isBilibiliUrl } from "./parser";
import { getVideoInfoByUrl } from "./api";

export async function quickCheckBilibiliUrl(url: string): Promise<{
  isValid: boolean;
  type?: string;
  bvid?: string;
  title?: string;
  error?: string;
}> {
  try {
    // 基础 URL 检查
    if (!isBilibiliUrl(url)) {
      return {
        isValid: false,
        error: "不是有效的 Bilibili URL",
      };
    }

    // 解析 URL
    const parsedUrl = parseBilibiliUrl(url);

    // 快速获取标题（无需凭证）
    let title: string | undefined;
    try {
      const videoInfo = await getVideoInfoByUrl(url);
      title = videoInfo.title;
    } catch {
      // 忽略错误，可能需要登录
    }

    return {
      isValid: true,
      type: parsedUrl.type,
      bvid: parsedUrl.bvid,
      title,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
