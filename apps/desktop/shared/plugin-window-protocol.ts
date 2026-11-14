import type {
  JsonValue,
  PluginWindowAppearance,
  PluginWindowMessageSender,
  PluginWindowMessageTarget,
  PluginWindowOptions,
  PluginWindowParams,
} from "@tau/plugins";
import type { DesktopPluginPackage } from "./plugin-package";

export const SYSTEM_APPEARANCE = "system.appearance";
export const WINDOW_PARAMS = "params";

export interface StateSnapshot<Value = JsonValue> {
  readonly revision: number;
  readonly value: Value | undefined;
}

export type StateAddress =
  | { scope: "app"; key: string }
  | { scope: "instance"; instanceId: string; key: string }
  | { scope: "plugin"; workspaceId: string; pluginId: string; key: string };

export type ThemePreference = Pick<PluginWindowAppearance, "themeId" | "appearance">;
export type AppearancePreference = Omit<PluginWindowAppearance, "mode">;

export interface OpenRequest {
  readonly endpoint: string;
  readonly windowId: string;
  readonly title: string;
  readonly options: PluginWindowOptions;
  readonly params: PluginWindowParams;
}

export interface BootstrapSnapshot {
  readonly windowId: string;
  readonly artifact: DesktopPluginPackage;
  readonly options: PluginWindowOptions;
  readonly endpoint: string;
  readonly appearance: StateSnapshot<AppearancePreference>;
  readonly params: StateSnapshot<PluginWindowParams>;
}

export type ReadyResult =
  | { status: "shown" }
  | { status: "sync"; latest: StateSnapshot<PluginWindowParams> };

export interface CommunicationCalls {
  detachEndpoint: [{ endpoint: string }, void];
  getState: [{ endpoint: string; key: string }, StateSnapshot];
  setState: [{ endpoint: string; key: string; value: JsonValue }, void];
  subscribeState: [{ endpoint: string; key: string }, StateSnapshot];
  unsubscribeState: [{ endpoint: string; key: string }, void];
  sendMessage: [
    { endpoint: string; target: PluginWindowMessageTarget; name: string; payload: JsonValue },
    number,
  ];
}

export interface PluginWindowCalls extends CommunicationCalls {
  bootstrap: [undefined, BootstrapSnapshot];
  ready: [{ revision: number }, ReadyResult];
  failed: [{ phase: "evaluate" | "mount" }, void];
  closeSelf: [undefined, void];
}

export interface MainWindowCalls extends CommunicationCalls {
  open: [OpenRequest, { instanceId: string }];
  close: [{ endpoint: string; instanceId: string }, void];
  attachEndpoint: [
    { pluginId: string; packageKey: string; workspaceId: string },
    { endpoint: string; appearance: StateSnapshot<AppearancePreference> },
  ];
  endpointReady: [{ endpoint: string }, void];
  publishTheme: [ThemePreference, void];
}

export interface WindowCommunicationEvents {
  stateChanged: {
    endpoint: string;
    change: { scope: StateAddress["scope"]; key: string; snapshot: StateSnapshot };
  };
  message: {
    endpoint: string;
    name: string;
    payload: JsonValue;
    sender: PluginWindowMessageSender;
  };
}

export type WindowTransport<Calls = CommunicationCalls> = {
  invoke<K extends keyof Calls>(
    method: K,
    input: Calls[K] extends [infer Input, unknown] ? Input : never
  ): Promise<Calls[K] extends [unknown, infer Output] ? Output : never>;
  on<K extends keyof WindowCommunicationEvents>(
    event: K,
    listener: (payload: WindowCommunicationEvents[K]) => void
  ): () => void;
};

export const windowChannel = (name: string) => `plugin-window:${name}`;
export const communicationMethods = [
  "detachEndpoint",
  "getState",
  "setState",
  "subscribeState",
  "unsubscribeState",
  "sendMessage",
] as const;
export const pluginWindowMethods = [
  ...communicationMethods,
  "bootstrap",
  "ready",
  "failed",
  "closeSelf",
] as const;
export const communicationEvents = ["stateChanged", "message"] as const;
