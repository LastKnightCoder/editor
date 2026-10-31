import { ASSET_PREFIX, isLocalAssetReference } from "./protocol";

export function isVideoResource(name: string, mime: string): boolean {
  return mime.toLowerCase().startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(name);
}

/** 为缺少 MIME 的历史附件识别图片文件头，不按文件名猜测内容类型。 */
export function imageMimeFromBytes(bytes: Uint8Array): string | undefined {
  const matches = (offset: number, value: number[] | string) => {
    const expected = typeof value === "string" ? [...value].map(char => char.charCodeAt(0)) : value;
    return expected.every((byte, index) => bytes[offset + index] === byte);
  };
  if (matches(0, [137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
  if (matches(0, [255, 216, 255])) return "image/jpeg";
  if (matches(0, "GIF87a") || matches(0, "GIF89a")) return "image/gif";
  if (matches(0, "RIFF") && matches(8, "WEBP")) return "image/webp";
  if (bytes.length >= 26 && matches(0, "BM")) return "image/bmp";
  if (matches(4, "ftyp") && (matches(8, "avif") || matches(8, "avis"))) return "image/avif";
  return undefined;
}

export function collaborationAssetMime(declared: string, header: Uint8Array): string {
  const mime = declared
    .split(";")[0]
    .trim()
    .toLowerCase()
    .replace(/^image\/x-ms-bmp$/, "image/bmp");
  return /^(image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/.test(
    mime
  )
    ? mime
    : (imageMimeFromBytes(header) ?? "application/octet-stream");
}

const httpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
    );
  } catch {
    return false;
  }
};

export function isSafeResource(value: string, field = ""): boolean {
  if (!value || value.startsWith(ASSET_PREFIX) || isLocalAssetReference(value)) return true;
  // bannerBg 可以是颜色或 CSS 渐变；带协议头的值（file:、https: 等）必须是 http(s)，
  // 其余情况只校验其中 url(...) 引用的地址。
  if (field === "bannerBg") {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return httpUrl(value);
    const references = (value.match(/url\(\s*['"]?[^'")]+['"]?\s*\)/g) || []) as string[];
    return references.every(reference =>
      httpUrl(reference.replace(/url\(\s*['"]?/, "").replace(/['"]?\s*\)$/, ""))
    );
  }
  return httpUrl(value);
}
