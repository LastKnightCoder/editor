import { PluginHost, createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { rendererSyncRegistry } from "../../src/app/plugins/sync-registry";
import { connectSyncRenderer } from "../../src/app/plugins/sync-bridge";
import { PluginSyncProvider } from "../../src/utils/sync/PluginSyncProvider";
import { desktopFetch } from "../../src/commands/fetch";
import type { JsonValue } from "@tau/plugins";

connectSyncRenderer();
let activeId = "";
let transportOrigin: string | undefined;
const host = new PluginHost({
  workspaceId: "verification",
  storage: createMemoryStorage(),
  fetch: (input, init) => {
    if (!transportOrigin) return desktopFetch(input, init);
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    );
    const target = new URL(transportOrigin);
    url.protocol = target.protocol;
    url.host = target.host;
    return desktopFetch(url, init);
  },
  sync: rendererSyncRegistry,
  settings: { register: () => ({ id: "sync", open: async () => {}, dispose() {} }) },
});
let provider: PluginSyncProvider;
export async function activate(artifact: DevelopmentPluginPackage, origin?: string) {
  activeId = artifact.manifest.id;
  transportOrigin = origin;
  if (typeof document === "undefined" || "require" in globalThis)
    throw new Error("插件必须在无Node集成的渲染进程运行");
  host.registerTrusted(evaluatePluginPackage(artifact, sharedPluginModules));
  await host.enable(artifact.manifest.id);
}
export async function open(config: JsonValue) {
  provider = new PluginSyncProvider(activeId, config);
  await provider.fileExists("probe");
}
export const exists = (name: string) => provider.fileExists(name);
export const download = (name: string) => provider.downloadFile(name);
export const upload = (name: string, bytes: number[]) =>
  provider.uploadFile(name, new Uint8Array(bytes));
export const create = (name: string, bytes: number[]) =>
  provider.createFileIfAbsent(name, new Uint8Array(bytes));
export const list = (prefix?: string) => provider.listFiles(prefix);
export const close = () => provider.dispose();
