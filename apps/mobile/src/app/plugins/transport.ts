import { createMobileAppActions } from "./app-actions";
import { createMobileFlashcards } from "./flashcards";
import { PluginPermissionError, PLUGIN_ENTITY_READ_PERMISSIONS } from "@tau/plugins";
import { createMobileApp } from "./app";
import { createMobileOwnData } from "./own-data";
import { createMobileEvents } from "./events";
import { createMobileData } from "./data";
import { getQueryClient } from "../../router";
import { createMobilePermissions } from "./permissions";
import {
  createBridgeWebSocket,
  type SocketClosed,
  type SocketMessage,
} from "@tau/plugins/websocket-bridge";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CHUNK_BYTES } from "@tau/db-schema/sync-protocol";
import type { JsonValue } from "@tau/plugins";
import {
  createBridgeFetch,
  FETCH_CHUNK_BYTES,
  type FetchResponseData,
} from "@tau/plugins/fetch-bridge";
import type { SyncProvider } from "@tau/plugins/sync";
import type { MobilePluginRuntime } from "./runtime";

export function encodePluginBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function decodePluginBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

interface ProviderRequest {
  token: string;
  requestId?: string;
  kind: "sync" | "upload" | "close";
  session: string;
  pluginId: string;
  config: JsonValue;
  method: keyof SyncProvider;
  name?: string;
  file?: { id: string; size: number };
  mimeType?: string;
}
async function networkCall<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (issue) {
    if (issue instanceof Error) throw issue;
    throw new TypeError(String(issue));
  }
}
export function createPluginFetch(
  token: string,
  budget: (pluginId?: string) => number | undefined = () => undefined
) {
  return (input: RequestInfo | URL, init?: RequestInit, pluginId?: string) => {
    const responseLimit = budget(pluginId);
    return createBridgeFetch({
      open: async request => {
        const { bufferedBody, ...metadata } = request;
        const id = await networkCall<number>("plugin_fetch_open", {
          token,
          request: { ...metadata, responseLimit },
        });
        if (bufferedBody) {
          try {
            for (let offset = 0; offset < bufferedBody.length; offset += FETCH_CHUNK_BYTES)
              if (
                !(await networkCall<boolean>("plugin_fetch_upload", {
                  token,
                  id,
                  chunk: encodePluginBytes(
                    bufferedBody.subarray(offset, offset + FETCH_CHUNK_BYTES)
                  ),
                }))
              )
                break;
            await networkCall("plugin_fetch_upload", { token, id, chunk: null });
          } catch (issue) {
            await networkCall("plugin_fetch_cancel", { token, id }).catch(() => undefined);
            throw issue;
          }
        }
        return id;
      },
      upload: (id, chunk) =>
        networkCall<boolean>("plugin_fetch_upload", {
          token,
          id,
          chunk: chunk === null ? null : encodePluginBytes(chunk),
        }),
      response: id => networkCall<FetchResponseData>("plugin_fetch_response", { token, id }),
      read: async id => {
        const chunk = await networkCall<string | null>("plugin_fetch_read", { token, id });
        return chunk === null ? null : decodePluginBytes(chunk);
      },
      buffer: async id => {
        const file = await networkCall<{ id: string; size: number }>("plugin_fetch_buffer", {
          token,
          id,
        });
        return readProviderFile(token, file, () => true);
      },
      cancel: id => networkCall<void>("plugin_fetch_cancel", { token, id }),
    })(input, init);
  };
}

export async function readProviderFile(
  token: string,
  file: { id: string; size: number },
  active: () => boolean
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error("插件文件大小无效");
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  while (true) {
    if (!active()) throw new DOMException("插件宿主会话已结束", "AbortError");
    const value = await networkCall<string | null>("plugin_file_read", {
      token,
      id: file.id,
      offset,
    });
    if (value === null) break;
    const chunk = decodePluginBytes(value);
    if (!chunk.length || chunk.length > FETCH_CHUNK_BYTES || offset + chunk.length > bytes.length)
      throw new Error("插件文件长度无效");
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== bytes.length) throw new Error("插件文件长度不完整");
  return bytes;
}
export async function writeProviderFile(
  token: string,
  id: string,
  bytes: Uint8Array,
  active: () => boolean
): Promise<void> {
  for (let offset = 0; offset < bytes.length; offset += FETCH_CHUNK_BYTES) {
    if (!active()) throw new DOMException("插件宿主会话已结束", "AbortError");
    await invoke("plugin_file_write", {
      token,
      id,
      offset,
      chunk: encodePluginBytes(bytes.subarray(offset, offset + FETCH_CHUNK_BYTES)),
    });
  }
}

export async function connectMobilePluginTransport(runtime: MobilePluginRuntime) {
  let token: string | undefined;
  let disposed = false;
  const openings = new Map<string, Promise<unknown>>();
  let fileQueue = Promise.resolve();
  const activeSync = new Map<string, number>();
  const stop = await listen<ProviderRequest>("plugin-provider-request", async ({ payload }) => {
    if (disposed || payload.token !== token) return;
    if (payload.kind === "close") {
      await openings.get(payload.session)?.catch(() => undefined);
      await runtime.sync.execute({ kind: "close", session: payload.session });
      openings.delete(payload.session);
      return;
    }
    const execute = async () => {
      if (disposed || payload.token !== token) return;
      let result: unknown;
      let error: string | undefined;
      try {
        if (payload.kind === "sync")
          activeSync.set(payload.pluginId, (activeSync.get(payload.pluginId) ?? 0) + 1);
        if (payload.kind === "upload") {
          if (!payload.file) throw new Error("插件上传缺少源文件");
          result = await runtime.upload.uploadOwned(
            payload.pluginId,
            {
              name: payload.name ?? "file",
              mimeType: payload.mimeType ?? "application/octet-stream",
              content: await readProviderFile(payload.token, payload.file, () => !disposed),
            },
            payload.config
          );
        } else {
          let opening = openings.get(payload.session);
          if (!opening) {
            opening = runtime.sync.execute({
              kind: "open",
              session: payload.session,
              pluginId: payload.pluginId,
              config: payload.config,
            });
            openings.set(payload.session, opening);
          }
          await opening;
          result = await runtime.sync.execute({
            kind: "call",
            session: payload.session,
            method: payload.method,
            args:
              payload.file && payload.method !== "downloadFile"
                ? [
                    payload.name,
                    await readProviderFile(payload.token, payload.file, () => !disposed),
                  ]
                : [payload.name ?? undefined],
          });
          if (result instanceof Uint8Array) {
            if (result.byteLength > CHUNK_BYTES) throw new Error("同步对象超过协议分块大小");
            if (!payload.file) throw new Error("插件下载缺少接收文件");
            await writeProviderFile(payload.token, payload.file.id, result, () => !disposed);
            result = { fileSize: result.byteLength };
          }
        }
      } catch (issue) {
        error = issue instanceof Error ? issue.message : String(issue);
      } finally {
        if (payload.kind === "sync") {
          const remaining = (activeSync.get(payload.pluginId) ?? 1) - 1;
          if (remaining) activeSync.set(payload.pluginId, remaining);
          else activeSync.delete(payload.pluginId);
        }
      }
      if (!disposed && payload.requestId)
        await invoke("plugin_transport_reply", {
          token,
          requestId: payload.requestId,
          result: result ?? null,
          error: error ?? null,
        }).catch(() => undefined);
    };
    if (payload.file) {
      const pending = fileQueue.then(execute);
      fileQueue = pending.catch(() => undefined);
      await pending;
    } else await execute();
  });
  try {
    token = await invoke<string>("plugin_transport_connect", { database: runtime.workspaceId });
    runtime.events = await createMobileEvents(runtime.workspaceId, token, () => {
      void getQueryClient().invalidateQueries();
    });
    runtime.data = createMobileData(
      runtime.workspaceId,
      token,
      () => {
        void getQueryClient().invalidateQueries();
      },
      async (context, permission) => {
        if (!runtime.permissions || (await context.permissions.query(permission)) !== "granted")
          throw new PluginPermissionError(permission, "denied");
      },
      async context => {
        await runtime.own?.ready(context);
      }
    );
    runtime.permissions = createMobilePermissions(runtime.workspaceId, token);
    runtime.flashcards = createMobileFlashcards(
      runtime.workspaceId,
      token,
      runtime.data,
      runtime.navigator,
      () => {
        void getQueryClient().invalidateQueries({ queryKey: ["flashcard"] });
      }
    );
    runtime.own = createMobileOwnData(
      runtime.workspaceId,
      token,
      runtime.data,
      () => {
        void getQueryClient().invalidateQueries();
      },
      async (context, kind) => {
        const permission = PLUGIN_ENTITY_READ_PERMISSIONS[kind];
        return !!(
          permission &&
          runtime.permissions &&
          (await context.permissions.query(permission)) === "granted"
        );
      }
    );
    runtime.app = createMobileApp(
      runtime.workspaceId,
      token,
      runtime.navigator,
      async (context, kind) => {
        const permission = PLUGIN_ENTITY_READ_PERMISSIONS[kind];
        return !!(
          permission &&
          runtime.permissions &&
          (await context.permissions.query(permission)) === "granted"
        );
      },
      (target, options, callerGuard) =>
        runtime.openEntityTarget(
          target,
          options.at ? JSON.stringify(options.at) : undefined,
          callerGuard
        ),
      createMobileAppActions(
        runtime.workspaceId,
        token,
        runtime.data,
        async context => {
          await runtime.own?.ready(context);
        },
        () => {
          void getQueryClient().invalidateQueries();
        }
      )
    );
    const socketToken = token;
    runtime.websocket = createBridgeWebSocket({
      open: (id, request) => networkCall("plugin_socket_open", { token: socketToken, id, request }),
      send: (id, message: SocketMessage) =>
        networkCall("plugin_socket_send", {
          token: socketToken,
          id,
          message:
            typeof message === "string"
              ? { kind: "text", value: message }
              : { kind: "binary", value: encodePluginBytes(message) },
        }),
      receive: async id => {
        const frame = await networkCall<
          { type: "message"; data: { kind: "text" | "binary"; value: string } } | SocketClosed
        >("plugin_socket_receive", { token: socketToken, id });
        return frame.type === "close"
          ? frame
          : {
              type: "message",
              data:
                frame.data.kind === "text" ? frame.data.value : decodePluginBytes(frame.data.value),
            };
      },
      close: (id, code, reason) =>
        networkCall("plugin_socket_close", { token: socketToken, id, code, reason }),
      dispose: id => networkCall("plugin_socket_dispose", { token: socketToken, id }),
    });
    runtime.fetch = createPluginFetch(token, pluginId =>
      pluginId && activeSync.has(pluginId) ? CHUNK_BYTES * 2 : undefined
    );
  } catch (error) {
    runtime.own?.dispose();
    runtime.app?.dispose();
    runtime.events?.dispose();
    runtime.permissions?.dispose();
    if (token) void invoke("plugin_transport_disconnect", { token }).catch(() => undefined);
    stop();
    throw error;
  }
  return () => {
    disposed = true;
    runtime.own?.dispose();
    runtime.app?.dispose();
    stop();
    runtime.permissions?.dispose();
    runtime.data?.dispose();
    runtime.events?.dispose();
    runtime.fetch = undefined;
    runtime.websocket = undefined;
    void invoke("plugin_transport_disconnect", { token }).catch(() => undefined);
    openings.clear();
  };
}
