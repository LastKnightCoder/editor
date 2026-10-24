import { RendererSyncRegistry, RendererUploadRegistry } from "@tau/plugins/provider-host";
import { copyJson } from "@tau/plugins/host";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { PluginHost, normalizePageParams, type StorageAdapter } from "@tau/plugins/host";
import { ContentPluginRegistry } from "@tau/plugins/content";
import { type PortablePlatform } from "@tau/plugins/portable";
import {
  evaluatePortablePluginPackage,
  adaptPortablePluginDefinition,
} from "@tau/plugins/rendering";
import type { PluginEnvironmentSource } from "@tau/plugins/environment-host";
import type {
  PluginContext,
  PluginPageDefinition,
  PluginNavigationEntry,
  PluginSettingsDefinition,
} from "@tau/plugins";
import type { Navigator } from "../../router/navigatorTypes";
import { verifyMobilePlugin, type MobilePluginPackage } from "../../services/plugins";

export interface MobilePluginPage {
  context: PluginContext;
  definition: PluginPageDefinition;
  generation: number;
}
export class MobilePluginRuntime {
  readonly host: PluginHost;
  readonly sync = new RendererSyncRegistry();
  readonly upload = new RendererUploadRegistry();
  fetch?: (input: RequestInfo | URL, init?: RequestInit, pluginId?: string) => Promise<Response>;
  readonly content = new ContentPluginRegistry();
  readonly pages = new Map<string, MobilePluginPage>();
  readonly entries = new Map<
    string,
    { context: PluginContext; definition: PluginNavigationEntry }
  >();
  readonly settings = new Map<
    string,
    { context: PluginContext; definition: PluginSettingsDefinition }
  >();
  readonly elementSupport = new Map<string, "none" | "render" | "edit">();
  readonly pageStates = new Map<string, () => import("@tau/plugins").JsonValue>();
  readonly errors = new Map<string, string>();
  private packageNodes = new Map<string, string[]>();
  private revision = 0;
  private listeners = new Set<() => void>();
  private styles: HTMLStyleElement[] = [];
  private disposed = false;
  private generation = 0;
  private unsubscribe: () => void;
  constructor(
    readonly environment: PluginEnvironmentSource,
    storage: StorageAdapter,
    readonly workspaceId: string,
    navigator: Pick<Navigator, "push">,
    readonly appVersion: string,
    restartRequired?: Set<string>
  ) {
    this.host = new PluginHost({
      workspaceId,
      restartRequired,
      environmentSource: environment,
      storage,
      sync: this.sync,
      upload: {
        register: (context, definition) => this.upload.register(context, definition),
        uploadRemote: (file, signal) => {
          const setting = getMobileSettingSnapshot()?.imageBed;
          const id = setting?.plugin?.id;
          if (setting?.active !== "plugin" || !id)
            throw new Error("请先配置远端上传插件，本地保存不能提供公网地址");
          const originalName = file.name.split(/[\\/]/).at(-1) || "file";
          const dot = originalName.lastIndexOf(".");
          const name =
            dot > 0
              ? `${originalName.slice(0, dot)}_${crypto.randomUUID()}${originalName.slice(dot)}`
              : `${originalName}_${crypto.randomUUID()}`;
          return this.upload.upload(
            id,
            { ...file, name },
            copyJson(setting.plugin?.configurations[id] ?? {}),
            signal
          );
        },
      },
      fetch: (input, init, owner) => {
        if (!this.fetch) throw new Error("插件网络尚未就绪");
        return this.fetch(input, init, owner?.pluginId);
      },
      pages: {
        register: (context, definition) => {
          const id = `${context.pluginId}:${definition.id}`;
          if (this.pages.has(id)) throw new Error("页面已注册");
          const page = { context, definition, generation: ++this.generation };
          this.pages.set(id, page);
          this.publish();
          return {
            id,
            open: async (params = {}) => {
              if (!this.active(context) || this.pages.get(id) !== page)
                throw new Error("插件页面不可用");
              const clean = normalizePageParams(params);
              const instance =
                definition.match === "params"
                  ? (definition.getId?.(clean) ?? JSON.stringify(clean))
                  : "single";
              if (typeof instance !== "string") throw new Error("页面身份必须是字符串");
              navigator.push("pluginPage", { id, instance, params: JSON.stringify(clean) });
            },
            dispose: () => {
              this.pages.delete(id);
              this.publish();
            },
          };
        },
      },
      navigation: {
        registerEntry: (context, definition) => {
          const id = `${context.pluginId}:${definition.id}`;
          this.entries.set(id, { context, definition });
          this.publish();
          return {
            dispose: () => {
              this.entries.delete(id);
              this.publish();
            },
          };
        },
      },
      settings: {
        register: (context, definition) => {
          if (definition.target && definition.target !== "sync" && definition.target !== "upload")
            throw new Error("当前移动宿主尚未提供此领域设置");
          const id = `${context.pluginId}:${definition.id}`;
          this.settings.set(id, { context, definition });
          this.publish();
          return {
            id,
            open: async () => {
              if (!this.active(context)) throw new Error("插件设置不可用");
              if (definition.target === "sync")
                navigator.push("syncProvider", { providerId: context.pluginId });
              else if (definition.target === "upload")
                navigator.push("uploadProvider", { providerId: context.pluginId });
              else navigator.push("pluginSettings", { id });
            },
            dispose: () => {
              this.settings.delete(id);
              this.publish();
            },
          };
        },
      },
    });
    this.unsubscribe = this.host.subscribe(this.publish);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  private publish = () => {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("插件订阅失败", error);
      }
    }
  };
  get isAvailable() {
    return !this.disposed;
  }
  isPluginActive(id: string) {
    return (
      !this.disposed &&
      this.host.listPlugins().some(plugin => plugin.id === id && plugin.state === "active")
    );
  }
  active(context: PluginContext) {
    return !this.disposed && !context.signal.aborted && this.isPluginActive(context.pluginId);
  }
  async start(
    packages: readonly MobilePluginPackage[],
    modules: Readonly<Record<string, unknown>>,
    validateContent?: (registry: ContentPluginRegistry) => void
  ) {
    const definitions = [];
    for (const item of packages) {
      if (!item.enabled || !item.artifact) continue;
      try {
        const artifact = await verifyMobilePlugin(
          item.artifact,
          this.environment.getSnapshot(),
          this.appVersion
        );
        if (this.disposed) return;
        const definition = evaluatePortablePluginPackage(artifact, modules, {
          environment: this.environment.getSnapshot(),
          appVersion: this.appVersion,
          profiles: ["web-v1"],
        });
        const platform = this.environment.getSnapshot().platform as PortablePlatform;
        const adapted = adaptPortablePluginDefinition(definition, artifact.manifest, platform);
        const contentDefinition = adapted.definition;
        const candidate = new ContentPluginRegistry();
        candidate.install([...this.content.list(), contentDefinition]);
        validateContent?.(candidate);
        this.host.registerTrusted(definition);
        this.content.install(candidate.list());
        Object.entries(adapted.support).forEach(([type, value]) =>
          this.elementSupport.set(type, value)
        );
        this.packageNodes.set(item.id, Object.keys(adapted.support));
        definitions.push(definition);
        if (artifact.css) {
          const style = document.createElement("style");
          style.textContent = artifact.css;
          document.head.append(style);
          this.styles.push(style);
        }
      } catch (error) {
        this.errors.set(item.id, String(error));
      }
    }
    for (const definition of definitions) {
      if (this.disposed) return;
      try {
        await this.host.enable(definition.id);
      } catch (error) {
        this.errors.set(definition.id, String(error));
      }
    }
    this.publish();
  }
  /** 插件当前在本会话登记的贡献数量，供详情页「此插件提供」展示。 */
  contributions(pluginId: string) {
    const count = (map: Map<string, { context: PluginContext }>) =>
      [...map.values()].filter(item => item.context.pluginId === pluginId).length;
    return {
      elements: this.packageNodes.get(pluginId)?.length ?? 0,
      pages: count(this.pages),
      entries: count(this.entries),
      settings: count(this.settings),
    };
  }
  async blockFromCenter(id: string) {
    if (this.disposed) return;
    for (const type of this.packageNodes.get(id) ?? []) this.elementSupport.set(type, "none");
    this.errors.set(id, "中心已撤回或禁用此版本，插件已停用；正文保留");
    this.publish();
    if (this.host.listPlugins().some(plugin => plugin.id === id)) await this.host.disable(id);
  }
  async dispose() {
    this.disposed = true;
    try {
      await this.host.dispose();
    } finally {
      this.unsubscribe();
      this.styles.forEach(style => style.remove());
      this.styles = [];
      this.pages.clear();
      this.entries.clear();
      this.settings.clear();
      this.pageStates.clear();
      this.content.install([]);
      this.elementSupport.clear();
      this.publish();
    }
  }
}
