import { BilibiliPlayUrl, BilibiliNetworkError } from "./types";
import { createHeaders } from "./api";
import { nodeFetch } from "@/commands";

export async function downloadWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: { Referer: "https://www.bilibili.com/", ...createHeaders() },
  });

  if (!response.ok) {
    throw new BilibiliNetworkError(
      `下载失败: ${response.status} ${response.statusText}`,
    );
  }

  const total = parseInt(response.headers.get("content-length") || "0");
  const reader = response.body?.getReader();

  if (!reader) {
    throw new BilibiliNetworkError("无法创建流读取器");
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (onProgress && total > 0) {
        onProgress(loaded, total);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 合并所有数据块
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

export function revokeMediaUrl(url: string): void {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function checkStreamAvailability(
  playUrl: BilibiliPlayUrl,
): Promise<{
  videoAvailable: boolean;
  audioAvailable: boolean;
}> {
  console.log("checkStreamAvailability", playUrl);

  try {
    await Promise.all([
      nodeFetch(playUrl.video, {
        method: "HEAD",
        headers: {
          Referer: "https://www.bilibili.com/",
          ...createHeaders(),
        },
      }),
      nodeFetch(playUrl.audio, {
        method: "HEAD",
        headers: { Referer: "https://www.bilibili.com/", ...createHeaders() },
      }),
    ]);

    return {
      videoAvailable: true,
      audioAvailable: true,
    };
  } catch (error) {
    console.error(error);
    return {
      videoAvailable: false,
      audioAvailable: false,
    };
  }
}

export async function getStreamInfo(url: string): Promise<{
  size: number;
  contentType: string;
  duration?: number;
}> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { Referer: "https://www.bilibili.com/", ...createHeaders() },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      size: parseInt(response.headers.get("content-length") || "0"),
      contentType: response.headers.get("content-type") || "unknown",
      // duration 需要通过其他方式获取
    };
  } catch (error) {
    throw new BilibiliNetworkError("获取流信息失败", error);
  }
}
