import { PluginHost, createMemoryStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { rendererSyncRegistry } from "../../src/app/plugins/sync-registry";
import { connectSyncRenderer } from "../../src/app/plugins/sync-bridge";
import { PluginSyncProvider } from "../../src/utils/sync/PluginSyncProvider";
import { desktopFetch } from "../../src/commands/fetch";
import type { JsonValue } from "@tau/plugins";

connectSyncRenderer();
const host = new PluginHost({
  workspaceId: "verification",
  storage: createMemoryStorage(),
  fetch: desktopFetch,
  sync: rendererSyncRegistry,
  settings: { register: () => ({ id: "sync", open: async () => {}, dispose() {} }) },
});
let provider: PluginSyncProvider;
export async function activate(artifact: DevelopmentPluginPackage) {
  if (typeof document === "undefined" || "require" in globalThis)
    throw new Error("插件必须在无Node集成的渲染进程运行");
  host.registerTrusted(evaluatePluginPackage(artifact, sharedPluginModules));
  await host.enable(artifact.manifest.id);
}
export async function open(config: JsonValue) {
  provider = new PluginSyncProvider("tau.sync-s3", config);
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
