import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { validatePluginManifest, comparePluginVersions, assertLocalId } from "./package";
import { readLocalPluginState } from "./local-state";
import * as syncModule from "./sync";
import { copyJson } from "./values";
import type { JsonValue } from "./json";
import type { SyncStorageConnection, SyncStorageDefinition } from "./sync";

/** 后台只执行已校验的专用入口，不加载插件UI或调用窗口activate。 */
export async function openSyncPlugin(options: {
  directory: string;
  pluginId: string;
  clientVersion: string;
  config: JsonValue;
  signal: AbortSignal;
}): Promise<SyncStorageConnection> {
  assertLocalId(options.pluginId);
  options.signal.throwIfAborted();
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
  const module = { exports: {} as { default?: SyncStorageDefinition } };
  const require = createRequire(filename);
  new Function("require", "module", "exports", code)(
    (id: string) => (id === "@tau/plugins/sync" ? syncModule : require(id)),
    module,
    module.exports
  );
  const definition = module.exports.default;
  if (!definition || definition.id !== options.pluginId || typeof definition.open !== "function")
    throw new Error("同步提供方身份或实现无效");
  options.signal.throwIfAborted();
  const connection = await definition.open(copyJson(options.config), { signal: options.signal });
  try {
    options.signal.throwIfAborted();
    if (
      !connection.target?.identity ||
      !connection.target.label ||
      ["stat", "read", "write", "list", "remove", "dispose"].some(
        key => typeof connection[key as keyof SyncStorageConnection] !== "function"
      )
    )
      throw new Error("同步存储连接不完整");
    return connection;
  } catch (error) {
    await connection.dispose?.();
    throw error;
  }
}

export function byteSource(bytes: Uint8Array) {
  return {
    size: bytes.byteLength,
    open: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
}

/** 只有小型版本元信息需要字节接口；快照与资源文件由宿主直接消费流。 */
export function snapshotStorage(connection: SyncStorageConnection, signal: AbortSignal) {
  const read = async (key: string) => {
    const object = await connection.read(key, { signal });
    if (!object) throw new Error("远端同步对象不存在");
    return new Uint8Array(await new Response(object.body).arrayBuffer());
  };
  return {
    downloadFile: read,
    fileExists: async (key: string) => (await connection.stat(key, { signal })) !== null,
    uploadFile: async (key: string, bytes: Uint8Array) => {
      const result = await connection.write(key, byteSource(bytes), { signal, mode: "replace" });
      if (result.status !== "written") throw new Error("普通覆盖写入返回了错误的状态");
      return true;
    },
    createFileIfAbsent: async (key: string, bytes: Uint8Array) =>
      (await connection.write(key, byteSource(bytes), { signal, mode: "create-only" })).status ===
      "written",
  };
}
