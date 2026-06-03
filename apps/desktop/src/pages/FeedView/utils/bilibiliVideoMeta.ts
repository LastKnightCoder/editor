import type { BiliBiliVideoMetaInfo } from "@/types/video-note";
import { getVideoInfoByUrl } from "@/utils/bilibili";
import type { BilibiliCredentials } from "@/utils/bilibili";

interface RssBilibiliVideoMeta {
  type?: string;
  bvid?: unknown;
  aid?: unknown;
  cid?: unknown;
  sourceUrl?: unknown;
}

const META_COMMENT_PATTERN = /<!--\s*tau:meta\s+({[\s\S]*?})\s*-->/;

function normalizeNumericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

export function extractBilibiliVideoMetaFromContent(
  content: string | null | undefined,
): RssBilibiliVideoMeta | null {
  const match = content?.match(META_COMMENT_PATTERN);
  if (!match?.[1]) return null;

  try {
    const meta = JSON.parse(match[1]) as RssBilibiliVideoMeta;
    if (meta.type !== "bilibili-video") return null;
    return meta;
  } catch {
    return null;
  }
}

export function hasBilibiliVideoMeta(
  content: string | null | undefined,
): boolean {
  return extractBilibiliVideoMetaFromContent(content) !== null;
}

export function isBilibiliVideoArticle(params: {
  url?: string | null;
  content?: string | null;
}): boolean {
  return Boolean(
    hasBilibiliVideoMeta(params.content) ||
    (params.url &&
      /^https?:\/\/(?:www\.)?bilibili\.com\/video\//i.test(params.url)),
  );
}

function buildCandidateUrls(
  url: string,
  meta: RssBilibiliVideoMeta | null,
): string[] {
  const candidates = [
    typeof meta?.sourceUrl === "string" ? meta.sourceUrl : null,
    url,
    normalizeNumericId(meta?.aid)
      ? `https://www.bilibili.com/video/av${normalizeNumericId(meta?.aid)}`
      : null,
  ];

  return Array.from(
    new Set(candidates.filter((item): item is string => Boolean(item?.trim()))),
  );
}

function resolveDefaultQuality(
  qualityOptions: Array<{ value: number }>,
): number {
  const values = qualityOptions
    .map((option) => option.value)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a);
  return values.find((value) => value <= 80) || values[0] || 80;
}

export async function resolveBilibiliVideoMetaInfo(
  params: {
    url: string;
    content?: string | null;
  },
  credentials?: BilibiliCredentials,
): Promise<BiliBiliVideoMetaInfo> {
  const cachedMeta = extractBilibiliVideoMetaFromContent(params.content);
  const candidateUrls = buildCandidateUrls(params.url, cachedMeta);
  let lastError: unknown = null;

  for (const url of candidateUrls) {
    try {
      const videoInfo = await getVideoInfoByUrl(url, credentials);
      return {
        type: "bilibili",
        bvid: videoInfo.bvid,
        cid: videoInfo.cid,
        quality: resolveDefaultQuality(videoInfo.qualityOptions),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("无法解析 Bilibili 视频信息");
}
