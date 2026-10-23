import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { JsonValue } from "@tau/plugins";
import type { SyncProvider } from "@tau/plugins/sync";
import type { MobilePluginRuntime } from "./runtime";

export function encodePluginBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
export function decodePluginBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
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
  bytes?: string;
  mimeType?: string;
}
interface FetchResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  url: string;
}

export function createPluginFetch(token: string): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const bytes = request.body ? new Uint8Array(await request.arrayBuffer()) : undefined;
    request.signal.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void invoke("plugin_fetch_cancel", { token, requestId }).catch(() => undefined);
    };
    let onAbort: () => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        cancel();
        reject(request.signal.reason ?? new DOMException("请求已取消", "AbortError"));
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([
        aborted,
        invoke<FetchResponse>("plugin_fetch", {
          token,
          request: {
            requestId,
            url: request.url,
            method: request.method,
            headers: [...request.headers],
            body: bytes ? encodePluginBytes(bytes) : null,
            redirect: request.redirect,
          },
        }),
      ]);
      request.signal.throwIfAborted();
      const body =
        [204, 205, 304].includes(result.status) || request.method === "HEAD"
          ? null
          : new Uint8Array(decodePluginBytes(result.body));
      const response = new Response(body, {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
      });
      Object.defineProperties(response, {
        url: { value: result.url },
        redirected: { value: result.url !== request.url },
      });
      return response;
    } catch (issue) {
      request.signal.throwIfAborted();
      if (issue instanceof Error) throw issue;
      throw new TypeError(String(issue));
    } finally {
      request.signal.removeEventListener("abort", onAbort);
    }
  };
}

export async function connectMobilePluginTransport(runtime: MobilePluginRuntime) {
  let token: string | undefined;
  let disposed = false;
  const openings = new Map<string, Promise<unknown>>();
  const stop = await listen<ProviderRequest>("plugin-provider-request", async ({ payload }) => {
    if (disposed || payload.token !== token) return;
    if (payload.kind === "close") {
      await openings.get(payload.session)?.catch(() => undefined);
      await runtime.sync.execute({ kind: "close", session: payload.session });
      openings.delete(payload.session);
      return;
    }
    let result: unknown;
    let error: string | undefined;
    try {
      if (payload.kind === "upload") {
        result = await runtime.upload.upload(
          payload.pluginId,
          {
            name: payload.name ?? "file",
            mimeType: payload.mimeType ?? "application/octet-stream",
            content: decodePluginBytes(payload.bytes ?? ""),
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
            payload.bytes === undefined || payload.bytes === null
              ? [payload.name ?? undefined]
              : [payload.name, decodePluginBytes(payload.bytes)],
        });
        if (result instanceof Uint8Array) result = encodePluginBytes(result);
      }
    } catch (issue) {
      error = issue instanceof Error ? issue.message : String(issue);
    }
    if (!disposed && payload.requestId)
      await invoke("plugin_transport_reply", {
        token,
        requestId: payload.requestId,
        result: result ?? null,
        error: error ?? null,
      }).catch(() => undefined);
  });
  try {
    token = await invoke<string>("plugin_transport_connect", { database: runtime.workspaceId });
    runtime.fetch = createPluginFetch(token);
  } catch (error) {
    stop();
    throw error;
  }
  return () => {
    disposed = true;
    stop();
    runtime.fetch = undefined;
    void invoke("plugin_transport_disconnect", { token }).catch(() => undefined);
    openings.clear();
  };
}
