import { ASSET_PREFIX, isLocalAssetReference } from "./protocol";

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
