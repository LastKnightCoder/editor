import type { PluginContext, PluginWindowDefinition, PluginWindows } from "@tau/plugins";
import { assertLocalId } from "@tau/plugins/host";
import { useThemeStore } from "@tau/themes/react";
import { invoke, isElectron, on, off } from "@/electron";
import { assertPluginUserActivation } from "./user-activation";
import { connectWindowCommunication } from "./window-communication";
import {
  windowChannel,
  type MainWindowCalls,
  type WindowTransport,
} from "../../../shared/plugin-window-protocol";
import { readWindowOptions, readWindowParams } from "../../../shared/plugin-window-values";

const transport: WindowTransport<MainWindowCalls> = {
  invoke: (method, input) => invoke(windowChannel(method), input),
  on(event, listener) {
    const channel = windowChannel(event);
    const receive = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload);
    on(channel, receive);
    return () => off(channel, receive);
  },
};

function themePreference(state = useThemeStore.getState()) {
  return { themeId: state.theme, appearance: state.appearance };
}

async function publishTheme() {
  await transport.invoke("publishTheme", themePreference());
}

export function connectPluginWindowTheme() {
  if (!isElectron) return;
  const sync = () =>
    void publishTheme().catch(error => console.error("插件窗口主题同步失败", error));
  sync();
  return useThemeStore.subscribe((state, previous) => {
    if (state.theme !== previous.theme || state.appearance !== previous.appearance) sync();
  });
}

export async function attachPluginWindows(
  context: PluginContext,
  packageKey: string,
  definitions: readonly PluginWindowDefinition[]
) {
  if (!isElectron) return undefined;
  const windows = new Map<string, Pick<PluginWindowDefinition, "title" | "options">>();
  for (const { id, title, options, component } of definitions) {
    assertLocalId(id);
    if (
      windows.has(id) ||
      typeof title !== "string" ||
      !title.trim() ||
      (typeof component !== "function" && (typeof component !== "object" || !component))
    )
      throw new Error("插件窗口声明无效");
    windows.set(id, { title, options: readWindowOptions(options) });
  }

  await publishTheme();
  context.signal.throwIfAborted();
  const connection = connectWindowCommunication(transport, context.signal, preference => ({
    ...preference,
    mode: useThemeStore.getState().mode,
  }));
  const unsubscribe = useThemeStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode) queueMicrotask(connection.refreshAppearance);
  });
  context.signal.addEventListener("abort", unsubscribe, { once: true });
  const { endpoint, appearance } = await transport.invoke("attachEndpoint", {
    pluginId: context.pluginId,
    workspaceId: context.workspaceId,
    packageKey,
  });
  connection.bind(endpoint, appearance);
  const api: PluginWindows = Object.freeze({
    communication: connection.communication,
    async open(id: string, params = {}) {
      context.signal.throwIfAborted();
      assertPluginUserActivation();
      const definition = windows.get(id);
      if (!definition) throw new Error("插件未声明此窗口");
      const { instanceId } = await transport.invoke("open", {
        endpoint,
        windowId: id,
        ...definition,
        params: readWindowParams(params),
      });
      context.signal.throwIfAborted();
      return Object.freeze({
        close: () => {
          context.signal.throwIfAborted();
          return transport.invoke("close", { endpoint, instanceId });
        },
      });
    },
  });
  return { api, ready: () => transport.invoke("endpointReady", { endpoint }) };
}
