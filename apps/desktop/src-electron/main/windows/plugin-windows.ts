import { randomUUID } from "node:crypto";
import { screen, webContents, BrowserWindow } from "electron";
import {
  SYSTEM_APPEARANCE,
  WINDOW_PARAMS,
  type BootstrapSnapshot,
  type OpenRequest,
  type ReadyResult,
} from "../../../shared/plugin-window-protocol";
import type { DesktopPluginPackage } from "../../../shared/plugin-package";
import { pluginWindowPackageKey } from "../../../shared/plugin-window-values";
import { createWindow, revealWindow } from "./create-window";
import { loadPluginWindow } from "./context";
import type { EndpointIdentity, PluginWindowCommunication } from "./plugin-window-communication";

interface Waiter {
  endpoint: string;
  params: OpenRequest["params"];
  resolve: (instance: { instanceId: string }) => void;
  reject: (reason: unknown) => void;
}

interface Instance {
  readonly id: string;
  readonly key: string;
  readonly owner: EndpointIdentity;
  readonly request: OpenRequest;
  readonly waiters: Waiter[];
  readonly handles: Set<string>;
  readonly closed: Promise<void>;
  readonly finish: () => void;
  timer?: ReturnType<typeof setTimeout>;
  artifact?: DesktopPluginPackage;
  window?: BrowserWindow;
  endpoint?: string;
  state: "opening" | "visible" | "closing";
}

const OPEN_TIMEOUT = 20_000;

export class PluginWindows {
  private readonly instances = new Map<string, Instance>();
  private readonly senders = new Map<number, Instance>();

  constructor(
    private readonly communication: PluginWindowCommunication,
    private readonly readPackage: (
      pluginId: string,
      packageKey: string
    ) => Promise<DesktopPluginPackage>
  ) {}

  async open(request: OpenRequest): Promise<{ instanceId: string }> {
    const owner = this.communication.identity(request.endpoint);
    if (!owner.online) throw new Error("插件窗口端点尚未就绪");
    if (owner.instance) throw new Error("只能从主窗口打开插件窗口");
    const key = JSON.stringify([owner.caller.workspaceId, owner.pluginId, request.windowId]);
    const existing = this.instances.get(key);
    if (existing?.state === "closing") {
      await existing.closed;
      return this.open(request);
    }
    if (existing && existing.owner.packageKey !== owner.packageKey)
      throw new Error("插件窗口属于另一个包版本");
    if (existing?.state === "visible" && existing.window) {
      this.publishParams(existing, request.params);
      existing.handles.add(request.endpoint);
      revealWindow(existing.window);
      return { instanceId: existing.id };
    }
    if (
      !existing &&
      [...this.instances.values()].filter(
        entry =>
          entry.owner.pluginId === owner.pluginId &&
          entry.owner.caller.workspaceId === owner.caller.workspaceId
      ).length >= 16
    )
      throw new Error("插件打开的窗口数量达到上限");
    return new Promise((resolve, reject) => {
      const waiter = { endpoint: request.endpoint, params: request.params, resolve, reject };
      if (existing) {
        if (existing.waiters.length >= 128) {
          reject(new Error("窗口打开请求过多"));
          return;
        }
        existing.waiters.push(waiter);
        this.publishParams(existing, request.params);
        return;
      }
      const { promise, resolve: finish } = Promise.withResolvers<void>();
      const instance: Instance = {
        id: randomUUID(),
        key,
        owner,
        request,
        waiters: [waiter],
        handles: new Set(),
        closed: promise,
        finish,
        state: "opening",
      };
      this.instances.set(key, instance);
      this.publishParams(instance, request.params);
      instance.timer = setTimeout(
        () => this.destroy(instance, new Error("插件窗口加载超时")),
        OPEN_TIMEOUT
      );
      void this.create(instance).catch(error => this.destroy(instance, error));
    });
  }

  private publishParams(instance: Instance, params: OpenRequest["params"]) {
    this.communication.publish(
      { scope: "instance", instanceId: instance.id, key: WINDOW_PARAMS },
      params
    );
  }

  private async create(instance: Instance) {
    const artifact = await this.readPackage(instance.owner.pluginId, instance.owner.packageKey);
    const key = await pluginWindowPackageKey(artifact);
    if (instance.state !== "opening") return;
    if (key !== instance.owner.packageKey) throw new Error("插件窗口包版本已变化");
    const { options, title } = instance.request;
    const initiator = instance.waiters.at(-1);
    if (!initiator) throw new Error("插件窗口打开请求已取消");
    const origin = webContents.fromId(
      this.communication.identity(initiator.endpoint).caller.webContentsId
    );
    const parent =
      origin && !origin.isDestroyed() ? BrowserWindow.fromWebContents(origin) : undefined;
    const display = parent
      ? screen.getDisplayMatching(parent.getBounds())
      : screen.getPrimaryDisplay();
    const bounds = options.kind === "fullscreen" ? display.bounds : display.workArea;
    const width =
      options.kind === "fullscreen" ? bounds.width : Math.min(options.width, bounds.width);
    const height =
      options.kind === "fullscreen" ? bounds.height : Math.min(options.height, bounds.height);
    const window = createWindow({
      route: "",
      document: "plugin-window",
      role: "plugin-window",
      chrome: options.kind === "normal" ? "native" : "none",
      title,
      width,
      height,
      x: bounds.x + Math.floor((bounds.width - width) / 2),
      y: bounds.y + Math.floor((bounds.height - height) / 2),
      resizable: options.kind === "normal",
      alwaysOnTop: options.kind === "compact" && options.alwaysOnTop === true,
      fullscreenable: options.kind !== "compact",
      enableLargerThanScreen: options.kind === "fullscreen" && process.platform === "darwin",
      show: false,
      devTools: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    const senderId = window.webContents.id;
    instance.window = window;
    instance.artifact = artifact;
    this.senders.set(senderId, instance);
    window.on("page-title-updated", event => event.preventDefault());
    window.on("close", event => {
      event.preventDefault();
      this.destroy(instance);
    });
    window.once("closed", () => {
      instance.state = "closing";
      this.release(instance);
      this.senders.delete(senderId);
      this.instances.delete(instance.key);
      instance.finish();
    });
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("will-redirect", event => event.preventDefault());
    window.webContents.on("did-start-navigation", details => {
      if (instance.endpoint && details.isMainFrame && !details.isSameDocument)
        this.destroy(instance, new Error("插件窗口文档已变化"));
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.once("render-process-gone", () =>
      this.destroy(instance, new Error("插件窗口渲染进程已退出"))
    );
    await loadPluginWindow(window);
  }

  private instance(senderId: number) {
    const instance = this.senders.get(senderId);
    if (!instance || instance.state === "closing") throw new Error("插件窗口已失效");
    return instance;
  }

  bootstrap(senderId: number, documentId: string): BootstrapSnapshot {
    const instance = this.instance(senderId);
    if (!instance.artifact || instance.endpoint) throw new Error("插件窗口启动请求无效");
    const appearance = this.communication.read({ scope: "app", key: SYSTEM_APPEARANCE });
    if (!appearance.value) throw new Error("窗口外观尚未就绪");
    instance.endpoint = this.communication.attach({
      pluginId: instance.owner.pluginId,
      packageKey: instance.owner.packageKey,
      caller: { ...instance.owner.caller, webContentsId: senderId, documentId },
      instance: { id: instance.id, windowId: instance.request.windowId },
    });
    return {
      windowId: instance.request.windowId,
      options: instance.request.options,
      artifact: instance.artifact,
      endpoint: instance.endpoint,
      appearance: appearance as BootstrapSnapshot["appearance"],
      params: this.params(instance),
    };
  }

  private params(instance: Instance) {
    return this.communication.read({
      scope: "instance",
      instanceId: instance.id,
      key: WINDOW_PARAMS,
    }) as BootstrapSnapshot["params"];
  }

  ready(senderId: number, revision: number): ReadyResult {
    const instance = this.instance(senderId);
    if (!instance.endpoint || !instance.window || instance.state !== "opening")
      throw new Error("插件窗口就绪请求无效");
    const latest = this.params(instance);
    if (latest.revision !== revision) return { status: "sync", latest };
    if (instance.request.options.kind === "fullscreen") {
      if (process.platform === "darwin") instance.window.setSimpleFullScreen(true);
      else instance.window.setFullScreen(true);
    }
    revealWindow(instance.window);
    instance.state = "visible";
    clearTimeout(instance.timer);
    this.communication.setOnline(instance.endpoint);
    for (const waiter of instance.waiters.splice(0)) {
      instance.handles.add(waiter.endpoint);
      waiter.resolve({ instanceId: instance.id });
    }
    return { status: "shown" };
  }

  close(endpoint: string, id: string): Promise<void> {
    const instance = [...this.instances.values()].find(entry => entry.id === id);
    if (!instance) return Promise.resolve();
    if (!instance.handles.has(endpoint)) throw new Error("窗口句柄不属于当前插件实例");
    this.destroy(instance);
    return instance.closed;
  }

  closeSelf(senderId: number) {
    const instance = this.instance(senderId);
    // 先撤销通信，再让当前 IPC 回包有机会送达。
    this.beginClose(instance);
    setImmediate(() => this.finishClose(instance));
  }

  fail(senderId: number) {
    this.destroy(this.instance(senderId), new Error("插件窗口组件加载失败"));
  }

  detachEndpoint(endpoint: string) {
    this.communication.detach(endpoint);
    for (const instance of this.instances.values()) {
      instance.handles.delete(endpoint);
      if (instance.state !== "opening") continue;
      const removed = instance.waiters.filter(waiter => waiter.endpoint === endpoint);
      if (!removed.length) continue;
      for (const waiter of removed) waiter.reject(new Error("打开窗口的插件实例已失效"));
      const remaining = instance.waiters.filter(waiter => waiter.endpoint !== endpoint);
      instance.waiters.splice(0, instance.waiters.length, ...remaining);
      const latest = remaining.at(-1);
      if (latest) this.publishParams(instance, latest.params);
      else this.destroy(instance);
    }
  }

  revoke(match: (identity: EndpointIdentity) => boolean) {
    for (const instance of this.instances.values())
      if (match(instance.owner)) this.destroy(instance);
  }

  private release(instance: Instance, error: unknown = new Error("插件窗口已关闭")) {
    clearTimeout(instance.timer);
    this.communication.removeInstance(instance.id);
    for (const waiter of instance.waiters.splice(0)) waiter.reject(error);
  }

  private beginClose(instance: Instance, error?: unknown) {
    if (instance.state === "closing") return;
    instance.state = "closing";
    this.release(instance, error);
  }

  private finishClose(instance: Instance) {
    if (instance.window) {
      if (!instance.window.isDestroyed()) instance.window.destroy();
    } else if (this.instances.get(instance.key) === instance) {
      this.instances.delete(instance.key);
      instance.finish();
    }
  }

  private destroy(instance: Instance, error?: unknown) {
    this.beginClose(instance, error);
    this.finishClose(instance);
  }
}
