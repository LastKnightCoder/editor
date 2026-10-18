import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { validatePluginManifest, comparePluginVersions, assertLocalId } from "./package";
import { readLocalPluginState } from "./local-state";
import * as syncModule from "./sync";
import { copyJson } from "./values";
import type { JsonValue } from "./json";
import type { SyncProvider, SyncProviderDefinition } from "./sync";

/** 后台只执行已校验的专用入口，不加载插件UI或调用窗口activate。 */
export async function openSyncPlugin(options: {
  directory: string;
  pluginId: string;
  clientVersion: string;
  config: JsonValue;
  signal?: AbortSignal;
}): Promise<SyncProvider> {
  assertLocalId(options.pluginId);
  options.signal?.throwIfAborted();
  const state = await readLocalPluginState(options.directory);
  if (!state.enabled[options.pluginId]) throw new Error("同步插件尚未启用");
  const root = await realpath(path.join(options.directory, options.pluginId));
  const manifest = validatePluginManifest(
    JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))
  );
  if (manifest.id !== options.pluginId || !manifest.sync) throw new Error("插件未提供同步后台入口");
  if (
    manifest.minAppVersion &&
    comparePluginVersions(options.clientVersion, manifest.minAppVersion) < 0
  )
    throw new Error("同步插件需要更新客户端");
  const filename = await realpath(path.join(root, manifest.sync));
  const relative = path.relative(root, filename);
  if (
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative) ||
    !(await stat(filename)).isFile()
  )
    throw new Error("同步插件入口不在插件目录内");
  const code = await readFile(filename, "utf8");
  if (createHash("sha256").update(code).digest("hex") !== manifest.integrity[manifest.sync])
    throw new Error("同步插件后台入口摘要不匹配");
  const module = { exports: {} as { default?: SyncProviderDefinition } };
  const require = createRequire(filename);
  new Function("require", "module", "exports", code)(
    (id: string) => (id === "@tau/plugins/sync" ? syncModule : require(id)),
    module,
    module.exports
  );
  const definition = module.exports.default;
  if (!definition || definition.id !== options.pluginId || typeof definition.create !== "function")
    throw new Error("同步提供方身份或实现无效");
  options.signal?.throwIfAborted();
  const provider = definition.create(copyJson(options.config));
  if (
    !provider ||
    ["uploadFile", "downloadFile", "fileExists", "listFiles", "createFileIfAbsent"].some(
      key => typeof provider[key as keyof SyncProvider] !== "function"
    )
  )
    throw new Error("同步提供方实现不完整");
  return provider;
}
