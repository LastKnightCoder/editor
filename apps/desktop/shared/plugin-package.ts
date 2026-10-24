import { validatePluginManifest, type PluginManifest } from "@tau/plugins/package";
import {
  readPortablePluginManifest,
  assertPortablePluginCompatibility,
  type ReadablePortablePluginManifest,
} from "@tau/plugins/portable";
import { assertPluginCompatibility } from "@tau/plugins/host";
import type { CenterHost } from "@tau/plugins/center";

export const DESKTOP_PLUGIN_CAPABILITIES = [
  "commands",
  "storage",
  "pages",
  "navigation",
  "settings",
  "dialogs",
  "editor",
  "editorCodecs",
  "sourceEditor",
  "media",
  "runtimeStyles",
  "fetch",
  "sync",
  "upload",
] as const;

export type DesktopPortableManifest = ReadablePortablePluginManifest & {
  backend?: never;
  minAppVersion?: never;
};
export type DesktopPluginManifest = PluginManifest | DesktopPortableManifest;
export interface DesktopPluginPackage {
  manifest: DesktopPluginManifest;
  code: string;
  css?: string;
}

export const desktopPluginHost = (appVersion: string): CenterHost => ({
  platform: "desktop",
  appVersion,
  apiVersions: [1],
  formatVersions: [1, 2, 3],
  profiles: ["web-v1"],
  capabilities: DESKTOP_PLUGIN_CAPABILITIES,
});

export const desktopPortableHost = (appVersion: string) => ({
  appVersion,
  profiles: ["web-v1"],
  capabilities: DESKTOP_PLUGIN_CAPABILITIES,
  environment: {
    platform: "desktop" as const,
    input: { coarsePointer: false, finePointer: true },
  },
});

export function readDesktopPluginManifest(value: unknown): DesktopPluginManifest {
  return (value as { formatVersion?: unknown } | null)?.formatVersion === 3
    ? readPortablePluginManifest(value)
    : validatePluginManifest(value);
}

export function assertDesktopPluginCompatibility(
  manifest: DesktopPluginManifest,
  appVersion: string
) {
  if (manifest.formatVersion === 3)
    assertPortablePluginCompatibility(manifest, desktopPortableHost(appVersion));
  else assertPluginCompatibility(manifest, appVersion);
}

export function assertDesktopPackageSource(
  manifest: DesktopPluginManifest,
  source: { kind: string; apiOrigin?: string; manifest?: unknown } | undefined,
  origin: string,
  packaged: boolean
) {
  if (manifest.formatVersion !== 3 || !packaged) return;
  if (
    source?.kind !== "center" ||
    source.apiOrigin !== origin ||
    !source.manifest ||
    JSON.stringify(readDesktopPluginManifest(source.manifest)) !== JSON.stringify(manifest)
  )
    throw new Error("正式构建只接受固定插件中心安装的跨端包");
}
