const MEDIA_PATH = /^_tau\/media\/([a-f0-9]{64})\.[a-z0-9]+$/;

export const publishedImageHash = (path: string): string | undefined => MEDIA_PATH.exec(path)?.[1];

/** 只提取发布目录内的摘要图片候选，归属由发布目标账本确认。 */
export function publishedImageReference(source: string, basePath: string): string | undefined {
  if (!/^(?:https?:\/\/|\/)/i.test(source)) return undefined;
  try {
    const origin = "https://tau.invalid";
    const url = new URL(source, origin);
    const base = new URL(basePath, origin).pathname;
    if (!url.pathname.startsWith(base)) return undefined;
    const path = decodeURIComponent(url.pathname.slice(base.length));
    return publishedImageHash(path) ? path : undefined;
  } catch {
    return undefined;
  }
}
