import { rendererASRRegistry } from "./asr-registry";
import { desktopWebSocket } from "@/commands/plugin-websocket";
import type { PluginEnvironmentSource } from "@tau/plugins/environment-host";
import { rendererSyncRegistry } from "./sync-registry";
import { createPluginBackend } from "./backend";
import { rendererTTSRegistry } from "./tts-registry";
import { rendererImagesRegistry } from "./images-registry";
import { rendererVideoRegistry } from "./video-bridge";
import { rendererPublishRegistry } from "./publish-registry";
import { rendererUploadRegistry } from "./upload-registry";
import { desktopPluginChat } from "./chat";
import { desktopPluginNotifications } from "./notifications";
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
  PluginOwnEntityKind,
  PluginHomePanelDefinition,
  PluginActionDefinition,
  PluginActionTarget,
  PluginActionTargetKind,
  PluginEntityRef,
  PluginEntityPanelDefinition,
  PluginEntityPanelKind,
} from "@tau/plugins";
import {
  notifyPluginPackagesChanged,
  notifyPluginSkillGateChanged,
  setPluginSkillGate,
} from "./skill-registry";
import { registerPluginEntityKind } from "@/services/plugin-entity-kinds";
import { toEntity } from "./entities";
import {
  PluginHost,
  normalizePageParams,
  type AppAdapter,
  type EntitiesAdapter,
  type RecordsAdapter,
  type LinksAdapter,
  type TransactionAdapter,
  type EventsAdapter,
  type ExcerptsAdapter,
  type MaterialsAdapter,
  type FlashcardsAdapter,
  type MCPAdapter,
  type StorageAdapter,
  type PluginSidebarItemState,
} from "@tau/plugins/host";
import type { Navigator } from "@/page/PageProvider";
import { ReactEditor } from "slate-react";
import { LocalPluginManager } from "./local-manager";
import {
  scanLocalPlugins,
  uninstallLocalPlugin,
  setLocalPluginEnabled,
} from "@/commands/plugin-local";
import type { DesktopPermissionBroker } from "./permissions";
import type { DesktopDataAdapter } from "./data";

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
    /** 以子项参数打开条目的页面 */
    openWith: (params: PluginPageParams) => Promise<void>;
    /** 角标、子项与动作行单独订阅：插件高频 update 只重渲染这一条目，不经 publish */
    subscribe: (listener: () => void) => () => void;
    getState: () => PluginSidebarItemState;
  }[];
}

const EMPTY_SIDEBAR_STATE: PluginSidebarItemState = Object.freeze({
  badge: 0,
  children: Object.freeze([]),
  action: null,
});

/** 首页的插件面板：同一注册期间对象不变，首页据此缓存包装组件 */
export interface RegisteredPluginHomePanel {
  /** 布局 ID：plugin:<pluginId>:<id> */
  id: string;
  definition: Readonly<Required<PluginHomePanelDefinition>>;
  context: PluginContext;
  mountId: number;
}

/** 详情区块：同一注册期间对象不变，详情页据此保持组件不重新挂载 */
export interface RegisteredPluginEntityPanel {
  /** plugin:<pluginId>:<id> */
  id: string;
  definition: Readonly<PluginEntityPanelDefinition>;
  context: PluginContext;
  mountId: number;
}

/** 对象动作：run 已由 PluginHost 包装，经 runAction 调用 */
export interface RegisteredPluginAction {
  /** plugin:<pluginId>:<id> */
  id: string;
  definition: Readonly<PluginActionDefinition>;
  context: PluginContext;
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
      state: PluginSidebarItemState;
      listeners: Set<() => void>;
      subscribe: (listener: () => void) => () => void;
      getState: () => PluginSidebarItemState;
    }
  >();
  private readonly homePanels = new Map<string, RegisteredPluginHomePanel>();
  private readonly actions = new Map<string, RegisteredPluginAction>();
  private readonly entityPanels = new Map<string, RegisteredPluginEntityPanel>();
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
      environmentSource?: PluginEnvironmentSource;
      storage: StorageAdapter;
      navigator: Pick<Navigator, "push">;
      plugins: readonly PluginDefinition[];
      validateEditor?: (contributions: readonly PluginEditorContribution[]) => void;
      openSettings?: (
        key: PluginSettingsKey,
        target?: "sync" | "upload" | "tts" | "asr" | "images" | "video" | "publish"
      ) => void;
      fetch?: typeof globalThis.fetch;
      services?: PluginServices;
      excerpts?: ExcerptsAdapter;
      materials?: MaterialsAdapter;
      flashcards?: FlashcardsAdapter;
      mcp?: MCPAdapter;
      permissions?: DesktopPermissionBroker;
      data?: DesktopDataAdapter;
      events?: EventsAdapter;
      app?: AppAdapter;
      entities?: EntitiesAdapter;
      records?: RecordsAdapter;
      links?: LinksAdapter;
      transaction?: TransactionAdapter;
      /** 用户对某个对象运行插件动作时，把它登记为插件选择过的引用（同 pick） */
      grantRefs?: (pluginId: string, refs: PluginEntityRef[]) => Promise<void>;
      /** 卸载并清除数据时删除插件在当前库的私有存储 */
      purgeStorage?: (pluginId: string) => Promise<void>;
      restartRequired?: Set<string>;
    }
  ) {
    this.host = new PluginHost({
      workspaceId: options.workspaceId,
      environmentSource: options.environmentSource,
      backend: createPluginBackend,
      sync: rendererSyncRegistry,
      tts: rendererTTSRegistry,
      asr: rendererASRRegistry,
      websocket: desktopWebSocket,
      images: rendererImagesRegistry,
      video: rendererVideoRegistry,
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
      flashcards: options.flashcards,
      mcp: options.mcp,
      permissions: options.permissions,
      data: options.data,
      events: options.events,
      app: options.app,
      notifications: desktopPluginNotifications,
      entities: options.entities && {
        ...options.entities,
        registerKind: (context, definition) => this.registerEntityKind(context, definition),
      },
      records: options.records,
      links: options.links,
      transaction: options.transaction,
      chat: desktopPluginChat,
      ai: desktopPluginAI,
      restartRequired: options.restartRequired,
      pages: { register: (context, definition) => this.registerPage(context, definition) },
      navigation: {
        registerEntry: (context, definition) =>
          this.registerSidebarItem(
            context,
            { ...definition, id: `navigation:${definition.id}` },
            definition.page.id.slice(context.pluginId.length + 1)
          ),
      },
      home: { registerPanel: (context, definition) => this.registerHomePanel(context, definition) },
      actions: { register: (context, definition) => this.registerAction(context, definition) },
      views: {
        registerEntityPanel: (context, definition) => this.registerEntityPanel(context, definition),
      },
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
      notifyPluginSkillGateChanged();
    });
    setPluginSkillGate(id => !this.disposed && this.host.getState(id) === "active");
    options.plugins.forEach(plugin => this.host.registerTrusted(plugin));
  }

  getRevision = () => this.revision;
  /** 插件详情页的权限分区与授权弹窗共用 */
  get permissions(): DesktopPermissionBroker | undefined {
    return this.options.permissions;
  }
  /** 插件详情页列出与恢复插件的删除操作 */
  get data(): DesktopDataAdapter | undefined {
    return this.options.data;
  }
  attachLocal(preferences: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">) {
    if (this.disposed || this.local) throw new Error("本地插件管理无法重复装配");
    this.local = new LocalPluginManager(
      this.host,
      this.options.plugins.map(plugin => plugin.id),
      scanLocalPlugins,
      async () => (await import("./shared-modules")).sharedPluginModules,
      preferences,
      () => {
        this.publish();
        notifyPluginPackagesChanged();
      },
      uninstallLocalPlugin,
      setLocalPluginEnabled,
      this.options.purgeStorage
    );
    return this.local;
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

  listHomePanels(): RegisteredPluginHomePanel[] {
    if (this.disposed) return [];
    return [...this.homePanels.values()].filter(
      ({ context }) => !context.signal.aborted && this.host.getState(context.pluginId) === "active"
    );
  }

  /** 某类对象详情里的插件区块，按注册顺序 */
  listEntityPanels(kind: PluginEntityPanelKind): RegisteredPluginEntityPanel[] {
    if (this.disposed) return [];
    return [...this.entityPanels.values()].filter(
      ({ context, definition }) =>
        definition.kinds.includes(kind) &&
        !context.signal.aborted &&
        this.host.getState(context.pluginId) === "active"
    );
  }

  /** 某类对象可用的插件动作，按注册顺序 */
  listActions(kind: PluginActionTargetKind): RegisteredPluginAction[] {
    if (this.disposed) return [];
    return [...this.actions.values()].filter(
      ({ context, definition }) =>
        definition.targets.includes(kind) &&
        !context.signal.aborted &&
        this.host.getState(context.pluginId) === "active"
    );
  }

  /** 先登记引用再调用插件；插件停用或动作已注销时抛错 */
  async runAction(action: RegisteredPluginAction, target: PluginActionTarget): Promise<void> {
    if (!this.listActions(target.kind).includes(action)) throw new Error("插件动作不可用");
    // 对话消息登记所在会话；文字不是引用，不登记
    const ref =
      target.kind === "chat-message"
        ? { kind: target.session.kind, id: target.session.id }
        : target.kind === "text"
          ? null
          : { kind: target.kind, id: target.id };
    if (ref) await this.options.grantRefs?.(action.context.pluginId, [ref]);
    await action.definition.run(target);
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
          openWith: (params: PluginPageParams) => entry.definition.page.open(params),
          subscribe: entry.subscribe,
          getState: entry.getState,
        })),
    };
  }

  private registerEntityPanel(
    context: PluginContext,
    definition: Readonly<PluginEntityPanelDefinition>
  ) {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const id = `plugin:${context.pluginId}:${definition.id}`;
    if (this.entityPanels.has(id)) throw new Error(`详情区块已注册：${definition.id}`);
    const panel = { id, definition, context, mountId: ++nextMountId };
    this.entityPanels.set(id, panel);
    this.publish();
    return {
      dispose: () => {
        if (this.entityPanels.get(id) !== panel) return;
        this.entityPanels.delete(id);
        this.publish();
      },
    };
  }

  private registerAction(context: PluginContext, definition: Readonly<PluginActionDefinition>) {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const id = `plugin:${context.pluginId}:${definition.id}`;
    if (this.actions.has(id)) throw new Error(`对象动作已注册：${definition.id}`);
    const action = { id, definition, context };
    this.actions.set(id, action);
    this.publish();
    return {
      dispose: () => {
        if (this.actions.get(id) !== action) return;
        this.actions.delete(id);
        this.publish();
      },
    };
  }

  private registerHomePanel(
    context: PluginContext,
    definition: Readonly<Required<PluginHomePanelDefinition>>
  ) {
    if (this.disposed) throw new Error("插件运行时已关闭");
    const id = `plugin:${context.pluginId}:${definition.id}`;
    if (this.homePanels.has(id)) throw new Error(`首页面板已注册：${definition.id}`);
    const panel = { id, definition, context, mountId: ++nextMountId };
    this.homePanels.set(id, panel);
    this.publish();
    return {
      dispose: () => {
        if (this.homePanels.get(id) !== panel) return;
        this.homePanels.delete(id);
        this.publish();
      },
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
    const listeners = new Set<() => void>();
    const entry = {
      context,
      definition,
      pageId,
      page,
      instanceId: pageInstanceId(page.definition, definition.params ?? {}),
      state: EMPTY_SIDEBAR_STATE,
      listeners,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getState: () => entry.state,
    };
    this.sidebarItems.set(id, entry);
    this.publish();
    return {
      update: (state: PluginSidebarItemState) => {
        if (this.sidebarItems.get(id) !== entry) return;
        entry.state = state;
        listeners.forEach(listener => listener());
      },
      dispose: () => {
        if (this.sidebarItems.get(id) === entry) this.sidebarItems.delete(id);
        listeners.clear();
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
    this.publish();
    try {
      await this.host.dispose();
    } finally {
      this.pages.clear();
      this.settings.clear();
      this.sidebarGroups.clear();
      this.sidebarItems.clear();
      this.editorContributions.clear();
      this.homePanels.clear();
      this.actions.clear();
      this.entityPanels.clear();
      this.options.permissions?.dispose();
      this.unsubscribe();
      this.publish();
      this.listeners.clear();
    }
  }

  /**
   * 插件内容的类型：从检索结果、@ 等处打开时，按声明的 open 进入插件页面并附上正文定位 at；
   * 类型名与图标交给数据适配随库保存，插件不运行时各处照样显示。
   */
  private registerEntityKind(context: PluginContext, definition: PluginOwnEntityKind) {
    this.options.entities?.registerKind?.(context, definition);
    const dispose = registerPluginEntityKind({
      pluginId: context.pluginId,
      kind: definition.kind,
      label: definition.label,
      mentionable: Boolean(definition.mentionable),
      open: async (entity, at) => {
        const page = this.getPage(context.pluginId, definition.open.page);
        if (!page) throw new Error("插件页面不可用");
        const params = normalizePageParams(definition.open.params?.(toEntity(entity)) ?? {});
        this.options.navigator.push(PLUGIN_PAGE_KEY, {
          pluginId: context.pluginId,
          pageId: definition.open.page,
          // 定位不参与实例身份：同一项内容换个位置打开仍是同一页
          instanceId: pageInstanceId(page.definition, params),
          params: JSON.stringify(at ? { ...params, at } : params),
        });
      },
    });
    return { dispose };
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
