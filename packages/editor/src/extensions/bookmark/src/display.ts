import type { BookmarkElement } from "./types";

/** 网址拆成主机与其余部分；解析失败整体当作主机。 */
export function splitBookmarkUrl(url: string): { host: string; rest: string } {
  try {
    const parsed = new URL(url);
    const rest = `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/^\/$/, "");
    return { host: parsed.host.replace(/^www\./, ""), rest };
  } catch {
    return { host: url, rest: "" };
  }
}

export interface BookmarkDisplay {
  title: string;
  description?: string;
  siteName: string;
  /** 去掉协议的完整网址 */
  address: string;
  host: string;
  /** 优先用的封面地址与其回退地址 */
  image?: string;
  imageFallback?: string;
  icon?: string;
  iconFallback?: string;
  /** 没读到任何网页信息：网址当标题 */
  bare: boolean;
}

/** 合并快照与用户改写，得到渲染用的字段；图片给出主地址与加载失败时的回退地址。 */
export function bookmarkDisplay(element: BookmarkElement): BookmarkDisplay {
  const { meta, overrides } = element;
  const { host, rest } = splitBookmarkUrl(element.url);
  const address = `${host}${rest}`;
  const pick = (stored?: string, source?: string) => {
    const unique = [...new Set([stored, source].filter((value): value is string => !!value))];
    return { main: unique[0], fallback: unique[1] };
  };
  const cover =
    overrides?.image === null
      ? { main: undefined, fallback: undefined }
      : overrides?.image
        ? pick(overrides.image, meta?.sourceImage)
        : pick(meta?.image, meta?.sourceImage);
  const icon = pick(meta?.icon, meta?.sourceIcon);
  const title = overrides?.title?.trim() || meta?.title?.trim();
  return {
    title: title || address,
    description: overrides?.description?.trim() || meta?.description?.trim() || undefined,
    siteName: meta?.siteName?.trim() || host,
    address,
    host,
    image: cover.main,
    imageFallback: cover.fallback,
    icon: icon.main,
    iconFallback: icon.fallback,
    bare: !title,
  };
}
