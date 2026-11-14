import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { copyJson } from "@tau/plugins/host";
import type { JsonValue } from "@tau/plugins";
import type {
  CommunicationCalls,
  StateAddress,
  StateSnapshot,
  WindowCommunicationEvents,
} from "../../../shared/plugin-window-protocol";

export interface WindowCaller {
  readonly webContentsId: number;
  readonly documentId: string;
  readonly databaseName: string;
  readonly workspaceId: string;
}

export interface EndpointIdentity {
  readonly caller: WindowCaller;
  readonly pluginId: string;
  readonly packageKey: string;
  readonly instance?: { id: string; windowId: string };
}

interface Endpoint extends EndpointIdentity {
  online: boolean;
  subscriptions: Set<string>;
}

type Delivery = <K extends keyof WindowCommunicationEvents>(
  caller: WindowCaller,
  event: K,
  payload: WindowCommunicationEvents[K]
) => boolean;

const addressKey = (address: StateAddress) => JSON.stringify(address);
const pluginKey = (workspaceId: string, pluginId: string) =>
  JSON.stringify([workspaceId, pluginId]);

export function windowJson(value: unknown): JsonValue {
  const copied = copyJson(value);
  if (Buffer.byteLength(JSON.stringify(copied)) > 64 * 1024)
    throw new Error("窗口通信数据不能超过 64 KiB");
  return copied;
}

export class PluginWindowCommunication {
  private readonly endpoints = new Map<string, Endpoint>();
  private readonly appState = new Map<string, StateSnapshot>();
  private readonly instanceState = new Map<string, Map<string, StateSnapshot>>();
  private readonly pluginState = new Map<string, Map<string, StateSnapshot>>();

  constructor(private readonly deliver: Delivery) {}

  attach(identity: EndpointIdentity) {
    const token = randomUUID();
    this.endpoints.set(token, { ...identity, online: false, subscriptions: new Set() });
    return token;
  }

  lookup(token: string) {
    return this.endpoints.get(token);
  }

  identity(token: string): Endpoint {
    const endpoint = this.lookup(token);
    if (!endpoint) throw new Error("窗口通信端点已失效");
    return endpoint;
  }

  tokensFor(webContentsId: number) {
    return [...this.endpoints]
      .filter(([, endpoint]) => endpoint.caller.webContentsId === webContentsId)
      .map(([token]) => token);
  }

  setOnline(token: string) {
    this.identity(token).online = true;
  }

  detach(token: string) {
    this.endpoints.delete(token);
  }

  private state(address: StateAddress): Map<string, StateSnapshot> | undefined;
  private state(address: StateAddress, create: true): Map<string, StateSnapshot>;
  private state(address: StateAddress, create = false) {
    if (address.scope === "app") return this.appState;
    const table = address.scope === "instance" ? this.instanceState : this.pluginState;
    const key =
      address.scope === "instance"
        ? address.instanceId
        : pluginKey(address.workspaceId, address.pluginId);
    let state = table.get(key);
    if (!state && create) {
      state = new Map();
      table.set(key, state);
    }
    return state;
  }

  read(address: StateAddress): StateSnapshot {
    return this.state(address)?.get(address.key) ?? { revision: 0, value: undefined };
  }

  publish(address: StateAddress, value: JsonValue) {
    const state = this.state(address, true);
    const previous = state.get(address.key);
    if (previous && isDeepStrictEqual(previous.value, value)) return;
    if (address.scope === "plugin" && !previous && state.size >= 128)
      throw new Error("每个插件最多可同步 128 个状态键");
    const snapshot = { revision: (previous?.revision ?? 0) + 1, value };
    state.set(address.key, snapshot);
    const subscription = addressKey(address);
    for (const [token, endpoint] of this.endpoints) {
      const matches =
        address.scope === "app" ||
        (address.scope === "instance"
          ? endpoint.instance?.id === address.instanceId
          : endpoint.subscriptions.has(subscription));
      if (matches)
        this.deliver(endpoint.caller, "stateChanged", {
          endpoint: token,
          change: { scope: address.scope, key: address.key, snapshot },
        });
    }
  }

  subscribe(token: string, address: StateAddress) {
    const subscriptions = this.identity(token).subscriptions;
    const key = addressKey(address);
    if (!subscriptions.has(key) && subscriptions.size >= 128)
      throw new Error("窗口状态订阅达到上限");
    subscriptions.add(key);
    return this.read(address);
  }

  unsubscribe(token: string, address: StateAddress) {
    this.identity(token).subscriptions.delete(addressKey(address));
  }

  send({ endpoint: source, target, name, payload }: CommunicationCalls["sendMessage"][0]) {
    const sender = this.identity(source);
    if (!sender.online) throw new Error("窗口通信端点尚未就绪");
    let delivered = 0;
    for (const [token, endpoint] of this.endpoints) {
      if (
        token === source ||
        !endpoint.online ||
        endpoint.pluginId !== sender.pluginId ||
        endpoint.packageKey !== sender.packageKey ||
        endpoint.caller.workspaceId !== sender.caller.workspaceId
      )
        continue;
      if (target === "main" && endpoint.instance) continue;
      if (typeof target === "object" && target.windowId !== endpoint.instance?.windowId) continue;
      if (
        this.deliver(endpoint.caller, "message", {
          endpoint: token,
          name,
          payload,
          sender: sender.instance
            ? { kind: "window", windowId: sender.instance.windowId }
            : { kind: "main" },
        })
      )
        delivered++;
    }
    return delivered;
  }

  removeInstance(instanceId: string) {
    this.instanceState.delete(instanceId);
    for (const [token, endpoint] of this.endpoints)
      if (endpoint.instance?.id === instanceId) this.detach(token);
  }

  revoke(match: (endpoint: EndpointIdentity) => boolean) {
    for (const [token, endpoint] of this.endpoints) if (match(endpoint)) this.detach(token);
  }

  clearPlugin(pluginId: string) {
    this.revoke(endpoint => endpoint.pluginId === pluginId);
    for (const key of this.pluginState.keys())
      if (JSON.parse(key)[1] === pluginId) this.pluginState.delete(key);
  }

  clearWorkspace(workspaceId: string) {
    this.revoke(endpoint => endpoint.caller.workspaceId === workspaceId);
    for (const key of this.pluginState.keys())
      if (JSON.parse(key)[0] === workspaceId) this.pluginState.delete(key);
  }

  dispose() {
    this.endpoints.clear();
    this.appState.clear();
    this.instanceState.clear();
    this.pluginState.clear();
  }
}
