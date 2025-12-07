import { ParsedBilibiliUrl, BilibiliParseError } from "./types";

export function isBilibiliUrl(url: string): boolean {
  const urlPattern =
    /^https?:\/\/(www\.)?bilibili\.com\/(video|bangumi\/play)\/.+/i;
  return urlPattern.test(url);
}

export function parseBilibiliUrl(url: string): ParsedBilibiliUrl {
  if (!isBilibiliUrl(url)) {
    throw new BilibiliParseError(`无效的 Bilibili URL: ${url}`);
  }

  const cleanUrl = cleanBilibiliUrl(url);

  try {
    if (cleanUrl.includes("/video/")) {
      return parseVideoUrl(cleanUrl);
    } else if (cleanUrl.includes("/bangumi/play/")) {
      return parseBangumiUrl(cleanUrl);
    }

    throw new BilibiliParseError(`不支持的 URL 格式: ${url}`);
  } catch (error) {
    if (error instanceof BilibiliParseError) {
      throw error;
    }
    throw new BilibiliParseError(`URL 解析失败: ${url}`, error);
  }
}

function cleanBilibiliUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    const keepParams = ["p", "t", "spm_id_from"];
    const newSearchParams = new URLSearchParams();

    for (const param of keepParams) {
      const value = urlObj.searchParams.get(param);
      if (value) {
        newSearchParams.set(param, value);
      }
    }

    urlObj.search = newSearchParams.toString();
    return urlObj.toString();
  } catch {
    return url;
  }
}

function parseVideoUrl(url: string): ParsedBilibiliUrl {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;

  const bvMatch = pathname.match(/\/video\/(BV[\w]+)/);
  if (bvMatch) {
    const bvid = bvMatch[1];
    const page = parseInt(urlObj.searchParams.get("p") || "1", 10);

    return {
      type: "BV",
      bvid,
      page,
      originalUrl: url,
    };
  }

  const avMatch = pathname.match(/\/video\/av(\d+)/);
  if (avMatch) {
    const aid = avMatch[1];
    const page = parseInt(urlObj.searchParams.get("p") || "1", 10);

    return {
      type: "BV", // AV 号也当作 BV 类型处理
      aid,
      page,
      originalUrl: url,
    };
  }

  throw new BilibiliParseError(`无法解析视频 URL: ${url}`);
}

function parseBangumiUrl(url: string): ParsedBilibiliUrl {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;

  // 提取 SS 号 (季度 ID)
  const ssMatch = pathname.match(/\/bangumi\/play\/ss(\d+)/);
  if (ssMatch) {
    return {
      type: "ss",
      ssid: ssMatch[1],
      originalUrl: url,
    };
  }

  // 提取 EP 号 (单集 ID)
  const epMatch = pathname.match(/\/bangumi\/play\/ep(\d+)/);
  if (epMatch) {
    return {
      type: "ep",
      epid: epMatch[1],
      originalUrl: url,
    };
  }

  throw new BilibiliParseError(`无法解析番剧 URL: ${url}`);
}

export function bv2av(bvid: string): number {
  const XOR_CODE = 23442827791579n;
  const MASK_CODE = 2251799813685247n;
  const BASE = 58n;

  const bvidArr = Array.from(bvid);
  [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
  [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];

  const table = "fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF";

  let result = 0n;
  for (let i = 0; i < 6; i++) {
    result = result * BASE + BigInt(table.indexOf(bvidArr[11 - i]));
  }

  return Number((result & MASK_CODE) ^ XOR_CODE);
}

export function av2bv(aid: number): string {
  const XOR_CODE = 23442827791579n;
  const MASK_CODE = 2251799813685247n;
  const BASE = 58n;

  const bytes = ["B", "V", "1", "", "", "", "", "", "", "", "", ""];
  const table = "fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF";

  let bvIdx = (BigInt(aid) ^ XOR_CODE) & MASK_CODE;

  for (let i = 0; i < 6; i++) {
    bytes[11 - i] = table[Number(bvIdx % BASE)];
    bvIdx = bvIdx / BASE;
  }

  [bytes[3], bytes[9]] = [bytes[9], bytes[3]];
  [bytes[4], bytes[7]] = [bytes[7], bytes[4]];

  return bytes.join("");
}

export function extractInitialState(html: string): any {
  try {
    const match = html.match(
      /\<\/script\>\<script\>window\.\_\_INITIAL\_STATE\_\_\=([\s\S]*?)\;\(function\(\)/,
    );
    if (match) {
      return JSON.parse(match[1]);
    }

    const fallbackMatch = html.match(
      /window\.__INITIAL_STATE__\s*=\s*({.+?});?\s*\(/,
    );
    if (fallbackMatch) {
      return JSON.parse(fallbackMatch[1]);
    }

    throw new Error("未找到初始状态数据");
  } catch (error) {
    throw new BilibiliParseError("解析页面初始数据失败", error);
  }
}

export function extractPlayInfo(html: string): any {
  try {
    // 提取 __playinfo__ 数据 - 使用参考项目的正则表达式
    const match = html.match(
      /\<script\>window\.\_\_playinfo\_\_\=([\s\S]*?)\<\/script\>\<script\>window\.\_\_INITIAL\_STATE\_\_\=/,
    );
    if (match) {
      return JSON.parse(match[1]);
    }

    // 备用正则表达式
    const fallbackMatch = html.match(
      /window\.__playinfo__\s*=\s*({.+?})<\/script>/,
    );
    if (fallbackMatch) {
      return JSON.parse(fallbackMatch[1]);
    }

    return null; // 可能需要通过 API 获取
  } catch (error) {
    throw new BilibiliParseError("解析播放信息失败", error);
  }
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}

export function filterTitle(title: string): string {
  return title.replace(/[<>:"/\\|?*]/g, "_").trim();
}
