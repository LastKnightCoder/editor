import type {
  PluginContext,
  PluginDefinition,
  PluginPageDefinition,
  PluginPageHandle,
  PluginEditorContribution,
  PluginSettingsDefinition,
  PluginSettingsHandle,
} from "@tau/plugins";
import { PluginHost, normalizePageParams, type StorageAdapter } from "@tau/plugins/host";
import type { Navigator } from "@/page/PageProvider";
import { ReactEditor } from "slate-react";

export const PLUGIN_PAGE_KEY = "plugin-page";
export const PLUGIN_WORKBENCH_KEY = "plugin-workbench";
let nextMountId = 0;

export interface RegisteredPluginPage {
  definition: PluginPageDefinition;
  context: PluginContext;
  mountId: number;
}

export type PluginSettingsKey = `plugin:${string}:${string}`;
export interface RegisteredPluginSettings {
  key: PluginSettingsKey;
  definition: PluginSettingsDefinition;
  context: PluginContext;
  mountId: number;
}

export class DesktopPluginRuntime {
  readonly host: PluginHost;
  private readonly pages = new Map<string, RegisteredPluginPage>();
  private readonly settings = new Map<string, RegisteredPluginSettings>();
  private readonly editorContributions = new Map<
    string,
    { context: PluginContext; contribution: PluginEditorContribution }
  >();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly options: {
      workspaceId: string;
      storage: StorageAdapter;
      navigator: Pick<Navigator, "push">;
      plugins: readonly PluginDefinition[];
      validateEditor?: (contributions: readonly PluginEditorContribution[]) => void;
      openSettings?: (key: PluginSettingsKey) => void;
      fetch?: typeof globalThis.fetch;
      restartRequired?: Set<string>;
    }
  ) {
    this.host = new PluginHost({
      workspaceId: options.workspaceId,
      storage: options.storage,
      fetch: options.fetch,
      restartRequired: options.restartRequired,
      pages: { register: (context, definition) => this.registerPage(context, definition) },
      settings: options.openSettings
        ? { register: (context, definition) => this.registerSettings(context, definition) }
        : undefined,
      editor: options.validateEditor
        ? { register: (context, contribution) => this.registerEditor(context, contribution) }
        : undefined,
    });
    this.unsubscribe = this.host.subscribe(this.publish);
    options.plugins.forEach(plugin => this.host.registerTrusted(plugin));
  }

  getRevision = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getPage(pluginId: string, pageId: string): RegisteredPluginPage | undefined {
    const page = this.pages.get(JSON.stringify([pluginId, pageId]));
    if (
      this.disposed ||
      !page ||
      page.context.signal.aborted ||
      this.host.getState(pluginId) !== "active"
    )
      return undefined;
    return page;
  }

  getEditorContributions(): PluginEditorContribution[] {
    if (this.disposed) return [];
    return [...this.editorContributions.values()]
      .filter(
        ({ context }) =>
          !context.signal.aborted && this.host.getState(context.pluginId) === "active"
      )
      .map(item => item.contribution);
  }

  listSettings(): RegisteredPluginSettings[] {
    if (this.disposed) return [];
    return [...this.settings.values()].filter(
      ({ context }) => !context.signal.aborted && this.host.getState(context.pluginId) === "active"
    );
  }

  private registerSettings(
    context: PluginContext,
    definition: PluginSettingsDefinition
  ): PluginSettingsHandle {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const key: PluginSettingsKey = `plugin:${context.pluginId}:${definition.id}`;
    if (this.settings.has(key)) throw new Error(`设置分区已注册：${definition.id}`);
    const section = { key, context, definition, mountId: ++nextMountId };
    this.settings.set(key, section);
    const revoke = () => this.publish();
    context.signal.addEventListener("abort", revoke, { once: true });
    this.publish();
    return {
      id: key,
      open: async () => {
        if (!this.listSettings().includes(section)) throw new Error("插件设置不可用");
        this.options.openSettings?.(key);
      },
      dispose: () => {
        context.signal.removeEventListener("abort", revoke);
        if (this.settings.get(key) !== section) return;
        this.settings.delete(key);
        this.publish();
      },
    };
  }

  private registerEditor(context: PluginContext, contribution: PluginEditorContribution) {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const id = contribution.extension.id;
    if (this.editorContributions.has(id)) throw new Error(`编辑器扩展已注册：${id}`);
    const snapshot = Object.freeze({
      ...contribution,
      extension: Object.freeze({
        ...contribution.extension,
        commands: contribution.extension.commands?.map(command => ({
          ...command,
          when: (editor: Parameters<NonNullable<typeof command.when>>[0]) =>
            !this.disposed &&
            this.editorContributions.get(id)?.contribution === snapshot &&
            !context.signal.aborted &&
            this.host.getState(context.pluginId) === "active" &&
            !ReactEditor.isReadOnly(editor) &&
            (command.when?.(editor) ?? true),
        })),
      }),
      codecs: Object.freeze([...(contribution.codecs ?? [])]),
    });
    const validateEditor = this.options.validateEditor;
    if (!validateEditor) throw new Error("当前宿主不支持编辑器扩展");
    validateEditor(
      [...this.editorContributions.values()].map(item => item.contribution).concat(snapshot)
    );
    const entry = { context, contribution: snapshot };
    this.editorContributions.set(id, entry);
    const revoke = () => this.publish();
    context.signal.addEventListener("abort", revoke, { once: true });
    this.publish();
    return {
      dispose: () => {
        context.signal.removeEventListener("abort", revoke);
        if (this.editorContributions.get(id) !== entry) return;
        this.editorContributions.delete(id);
        this.publish();
      },
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.publish();
    try {
      await this.host.dispose();
    } finally {
      this.pages.clear();
      this.settings.clear();
      this.editorContributions.clear();
      this.unsubscribe();
      this.publish();
      this.listeners.clear();
    }
  }

  private registerPage(context: PluginContext, definition: PluginPageDefinition): PluginPageHandle {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const key = JSON.stringify([context.pluginId, definition.id]);
    if (this.pages.has(key)) throw new Error(`插件页面已注册：${definition.id}`);
    const page = { context, definition, mountId: ++nextMountId };
    this.pages.set(key, page);
    this.publish();
    return {
      id: `${context.pluginId}:${definition.id}`,
      open: async (params = {}) => {
        if (this.getPage(context.pluginId, definition.id) !== page)
          throw new Error("插件页面不可用");
        const clean = normalizePageParams(params);
        const instanceId =
          definition.match === "params"
            ? (definition.getId?.(clean) ?? JSON.stringify(clean))
            : "single";
        if (typeof instanceId !== "string") throw new Error("页面实例身份必须是字符串");
        this.options.navigator.push(PLUGIN_PAGE_KEY, {
          pluginId: context.pluginId,
          pageId: definition.id,
          instanceId,
          params: JSON.stringify(clean),
        });
      },
      dispose: () => {
        if (this.pages.get(key) === page) {
          this.pages.delete(key);
          this.publish();
        }
      },
    };
  }

  private publish = () => {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("插件页面订阅失败", error);
      }
    }
  };
}
