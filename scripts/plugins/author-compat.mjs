/** 旧桌面回归显式选择原协议，不将跨端开发声明带入生产校验。 */
export function desktopAuthorManifest(manifest) {
  const base = { ...manifest };
  delete base.profile;
  delete base.targets;
  return {
    ...base,
    formatVersion: 1,
    platform: "desktop",
    minAppVersion: manifest.targets?.desktop?.minAppVersion ?? manifest.minAppVersion ?? "0.59.0",
  };
}
