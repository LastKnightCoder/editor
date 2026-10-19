import type { JsonValue } from "@tau/plugins";
import { invoke, isElectron, on } from "@/electron";
import { withModule } from "./module-init";
import type {
  VideoProvidersState,
  VideoRendererRequest,
  VideoRendererResults,
} from "../../shared/video-renderer";

export const savePluginVideoConfig = (pluginId: string, config: JsonValue): Promise<void> =>
  withModule("plugin-local", () => invoke("plugin-local:video-config", pluginId, config));

/** 经主进程转发到主窗口的视频插件；取消时同步通知插件侧。 */
export function callPluginVideo<K extends VideoRendererRequest["kind"]>(
  request: Extract<VideoRendererRequest, { kind: K }>,
  signal?: AbortSignal
): Promise<VideoRendererResults[K]> {
  return withModule("plugin-local", async () => {
    signal?.throwIfAborted();
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void invoke("plugin-local:video-cancel", requestId).catch(() => undefined);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const result = await invoke<VideoRendererResults[K]>(
        "plugin-local:video-request",
        requestId,
        request
      );
      signal?.throwIfAborted();
      return result;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  });
}

let state: VideoProvidersState = { ready: false, providers: [] };
const listeners = new Set<() => void>();
let connected = false;

const publish = (next: VideoProvidersState) => {
  state = next;
  listeners.forEach(listener => listener());
};

function connect() {
  if (connected || !isElectron) return;
  connected = true;
  on("plugin-video:providers", (_event: unknown, next: VideoProvidersState) => publish(next));
  void withModule("plugin-local", () => invoke<VideoProvidersState>("plugin-local:video-providers"))
    .then(publish)
    .catch(() => undefined);
}

/** 已启用的视频提供方列表，所有窗口经主进程广播同步；首次读取或订阅时建立同步。 */
export function subscribeVideoProviders(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVideoProviders = () => {
  connect();
  return state;
};
