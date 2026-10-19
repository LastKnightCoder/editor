import { rendererSyncRegistry } from "./sync-registry";
import { rendererTTSRegistry } from "./tts-registry";
import { rendererImagesRegistry } from "./images-registry";
import { rendererPublishRegistry } from "./publish-registry";
import { rendererUploadRegistry } from "./upload-registry";
import { desktopPluginChat } from "./chat";
import { uploadRemoteResource } from "@/services/resource-upload";
import type {
  PluginContext,
  PluginServices,
  PluginDefinition,
  PluginPageDefinition,
  PluginPageHandle,
  PluginEditorContribution,
  PluginSettingsDefinition,
  PluginSettingsHandle,
  PluginSidebarGroupDefinition,
  PluginSidebarItemDefinition,
  PluginPageParams,
  PluginSidebarIcon,
} from "@tau/plugins";
import { registerPluginSkill } from "./skill-registry";
import {
  PluginHost,
  normalizePageParams,
  type ExcerptsAdapter,
  type MaterialsAdapter,
  type MCPAdapter,
  type StorageAdapter,
} from "@tau/plugins/host";
import type { Navigator } from "@/page/PageProvider";
import { ReactEditor } from "slate-react";
import { DevelopmentPluginManager } from "./development-manager";
import { LocalPluginManager } from "./local-manager";
import {
  scanLocalPlugins,
  uninstallLocalPlugin,
  setLocalPluginEnabled,
} from "@/commands/plugin-local";
import type { DevelopmentSession } from "@/types/plugin-development";

export const PLUGIN_PAGE_KEY = "plugin-page";
export const PLUGIN_WORKBENCH_KEY = "plugin-workbench";
/** 插件中心与管理详情页，插件设置也在此承载。 */
export const PLUGIN_DETAIL_KEY = "plugin-detail";
let nextMountId = 0;

function pageInstanceId(definition: PluginPageDefinition, params: PluginPageParams): string {
  const id =
    definition.match === "params"
      ? (definition.getId?.(params) ?? JSON.stringify(params))
      : "single";
  if (typeof id !== "string") throw new Error("页面实例身份必须是字符串");
  return id;
}

export interface PluginSidebarSnapshot {
  groups: { id: string; title: string }[];
  items: {
    id: string;
    title: string;
    icon?: PluginSidebarIcon;
    group?: string;
    pluginId: string;
    pageId: string;
    instanceId: string;
    open: () => Promise<void>;
  }[];
}

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
  development?: DevelopmentPluginManager;
  local?: LocalPluginManager;
  private readonly pages = new Map<string, RegisteredPluginPage>();
  private readonly settings = new Map<string, RegisteredPluginSettings>();
  private readonly sidebarGroups = new Map<
    string,
    { definition: PluginSidebarGroupDefinition; context: PluginContext }
  >();
  private readonly sidebarItems = new Map<
    string,
    {
      definition: PluginSidebarItemDefinition;
      pageId: string;
      page: RegisteredPluginPage;
      context: PluginContext;
      instanceId: string;
    }
  >();
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
      openSettings?: (
        key: PluginSettingsKey,
        target?: "sync" | "upload" | "tts" | "images" | "publish"
      ) => void;
      fetch?: typeof globalThis.fetch;
      services?: PluginServices;
      excerpts?: ExcerptsAdapter;
      materials?: MaterialsAdapter;
      mcp?: MCPAdapter;
      restartRequired?: Set<string>;
      reloadCounts?: Map<string, number>;
    }
  ) {
    this.host = new PluginHost({
      workspaceId: options.workspaceId,
      sync: rendererSyncRegistry,
      tts: rendererTTSRegistry,
      images: rendererImagesRegistry,
      publish: rendererPublishRegistry,
      upload: {
        register: (context, definition) => rendererUploadRegistry.register(context, definition),
        uploadRemote: uploadRemoteResource,
      },
      storage: options.storage,
      fetch: options.fetch,
      services: options.services,
      excerpts: options.excerpts,
      materials: options.materials,
      skills: { register: registerPluginSkill },
      mcp: options.mcp,
      chat: desktopPluginChat,
      ai: desktopPluginAI,
      restartRequired: options.restartRequired,
      pages: { register: (context, definition) => this.registerPage(context, definition) },
      sidebar: {
        registerGroup: (context, definition) => this.registerSidebarGroup(context, definition),
        registerItem: (context, definition, pageId) =>
          this.registerSidebarItem(context, definition, pageId),
      },
      settings: options.openSettings
        ? { register: (context, definition) => this.registerSettings(context, definition) }
        : undefined,
      editor: options.validateEditor
        ? { register: (context, contribution) => this.registerEditor(context, contribution) }
        : undefined,
    });
    this.unsubscribe = this.host.subscribe(() => {
      this.publish();
      rendererImagesRegistry.notifyChanged();
      rendererPublishRegistry.notifyChanged();
    });
    options.plugins.forEach(plugin => this.host.registerTrusted(plugin));
  }

  getRevision = () => this.revision;
  attachLocal(preferences: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">) {
    if (this.disposed || this.local) throw new Error("本地插件管理无法重复装配");
    this.local = new LocalPluginManager(
      this.host,
      this.options.plugins.map(plugin => plugin.id),
      scanLocalPlugins,
      async () => (await import("./shared-modules")).sharedPluginModules,
      preferences,
      this.publish,
      uninstallLocalPlugin,
      setLocalPluginEnabled
    );
    return this.local;
  }
  attachDevelopment(session: DevelopmentSession) {
    this.development = new DevelopmentPluginManager(
      this.host,
      session,
      async () => (await import("./shared-modules")).sharedPluginModules,
      undefined,
      this.publish,
      this.options.reloadCounts
    );
    this.publish();
    return this.development;
  }
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

  listSidebar(): PluginSidebarSnapshot {
    if (this.disposed) return { groups: [], items: [] };
    const active = (context: PluginContext) =>
      !context.signal.aborted && this.host.getState(context.pluginId) === "active";
    return {
      groups: [...this.sidebarGroups]
        .filter(([, entry]) => active(entry.context))
        .map(([id, entry]) => ({ id, title: entry.definition.title })),
      items: [...this.sidebarItems]
        .filter(
          ([, entry]) =>
            active(entry.context) &&
            this.getPage(entry.context.pluginId, entry.pageId) === entry.page
        )
        .map(([id, entry]) => ({
          id,
          title: entry.definition.title,
          icon: entry.definition.icon,
          group: entry.definition.group,
          pluginId: entry.context.pluginId,
          pageId: entry.pageId,
          instanceId: entry.instanceId,
          open: () => entry.definition.page.open(entry.definition.params),
        })),
    };
  }

  private registerSidebarGroup(context: PluginContext, definition: PluginSidebarGroupDefinition) {
    const id = `plugin:${context.pluginId}:${definition.id}`;
    if (this.sidebarGroups.has(id)) throw new Error(`侧边栏分组已注册：${definition.id}`);
    const entry = { context, definition };
    this.sidebarGroups.set(id, entry);
    this.publish();
    return {
      id,
      dispose: () => {
        if (this.sidebarGroups.get(id) === entry) this.sidebarGroups.delete(id);
        this.publish();
      },
    };
  }

  private registerSidebarItem(
    context: PluginContext,
    definition: PluginSidebarItemDefinition,
    pageId: string
  ) {
    const id = `plugin:${context.pluginId}:${definition.id}`;
    if (this.sidebarItems.has(id)) throw new Error(`侧边栏条目已注册：${definition.id}`);
    if (
      definition.group?.startsWith("plugin:") &&
      !definition.group.startsWith(`plugin:${context.pluginId}:`)
    )
      throw new Error("不能向其他插件的分组注册条目");
    const page = this.pages.get(JSON.stringify([context.pluginId, pageId]));
    if (!page || page.context !== context) throw new Error("侧边栏页面不可用");
    const entry = {
      context,
      definition,
      pageId,
      page,
      instanceId: pageInstanceId(page.definition, definition.params ?? {}),
    };
    this.sidebarItems.set(id, entry);
    this.publish();
    return {
      dispose: () => {
        if (this.sidebarItems.get(id) === entry) this.sidebarItems.delete(id);
        this.publish();
      },
    };
  }

  private registerSettings(
    context: PluginContext,
    definition: PluginSettingsDefinition
  ): PluginSettingsHandle {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const key: PluginSettingsKey = `plugin:${context.pluginId}:${definition.id}`;
    if (
      definition.target !== undefined &&
      [...this.settings.values()].some(
        section =>
          section.context.pluginId === context.pluginId &&
          section.definition.target === definition.target
      )
    )
      throw new Error("插件的提供方配置分区已经注册");
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
        this.options.openSettings?.(key, definition.target);
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
    this.local?.cancel();
    this.development?.cancel();
    this.publish();
    try {
      await this.host.dispose();
    } finally {
      this.pages.clear();
      this.settings.clear();
      this.sidebarGroups.clear();
      this.sidebarItems.clear();
      this.editorContributions.clear();
      this.unsubscribe();
      this.publish();
      this.listeners.clear();
      await this.development?.close();
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
        const instanceId = pageInstanceId(definition, clean);
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
import { desktopPluginAI } from "./ai";
