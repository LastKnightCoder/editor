/** R2 上浏览器扩展的发布目录；官网下载区读这里的 latest.json */
export const EXTENSION_PREFIX = "browser-extension";
export const EXTENSION_MANIFEST_NAME = "latest.json";
/** 官网只发 Chrome 包，Edge 等 Chromium 系浏览器加载同一份 */
export const EXTENSION_BROWSER = "chrome";

/** 与 apps/browser-extension/wxt.config.ts 的 zip.artifactTemplate 对应，改名要两处同改 */
export function extensionZipName(version) {
  return `Tau-Companion-v${version}-${EXTENSION_BROWSER}.zip`;
}

export function buildExtensionManifest({ version, size, sha256, now }) {
  return {
    version,
    releaseDate: now.toISOString(),
    file: extensionZipName(version),
    size,
    sha256,
  };
}
