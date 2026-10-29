import { ASRProviderRegistry } from "@tau/plugins/asr-host";
import { RendererTTSRegistry } from "@tau/plugins/tts-host";
import type { PluginWebSocket } from "@tau/plugins";
import { RendererSyncRegistry, RendererUploadRegistry } from "@tau/plugins/provider-host";
import { copyJson } from "@tau/plugins/host";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { PluginHost, normalizePageParams, type StorageAdapter } from "@tau/plugins/host";
import { ContentPluginRegistry } from "@tau/plugins/content";
import { evaluatePortablePluginPackage, getPluginNodeTypes } from "@tau/plugins/rendering";
import type { PluginEnvironmentSource } from "@tau/plugins/environment-host";
import type {
  PluginContext,
  PluginPageDefinition,
  PluginNavigationEntry,
  PluginSettingsDefinition,
  PluginOwnEntityKind,
  PluginActionDefinition,
  PluginActionTargetKind,
} from "@tau/plugins";
import type { Navigator } from "../../router/navigatorTypes";
import { verifyMobilePlugin, type MobilePluginPackage } from "../../services/plugins";
import { isSkillPackageManifest, validateMobilePackageManifest } from "@tau/plugins/template";
import type { MobilePluginAI } from "./ai";
import { createMobilePluginChat } from "./ai-chat";
import type { MobileAiSkillPackage } from "./ai-skills";

export type MobileActionTarget = { kind: "card" | "article" | "document"; id: string };

export interface MobilePluginAction {
  id: string;
  context: PluginContext;
  definition: Readonly<PluginActionDefinition>;
}

export interface MobilePluginPage {
  context: PluginContext;
  definition: PluginPageDefinition;
  generation: number;
}
export class MobilePluginRuntime {
  readonly entityKinds = new Map<
    string,
    { context: PluginContext; definition: PluginOwnEntityKind }
  >();
  own?: import("./own-data").MobileOwnData;
  app?: import("./app").MobileAppAdapter;
  events?: Awaited<ReturnType<typeof import("./events").createMobileEvents>>;
  data?: import("./data").MobileDataAdapter;
  permissions?: import("@tau/plugins/permission-host").PluginPermissionBroker;
  flashcards?: import("./flashcards").MobileFlashcards;
  ai?: MobilePluginAI;
  aiMcp?: ReturnType<typeof import("./ai-mcp").createMobilePluginMcp>;
  aiSkills?: ReturnType<typeof import("./ai-skills").createMobilePluginAiSkills>;
  readonly aiChat = createMobilePluginChat();
  private readonly aiPackages = new Map<string, MobileAiSkillPackage>();
  private readonly skillEligibility = new Set<string>();
  private skillInventoryEpoch = 0;
  private skillPackagesAllowed = true;
  private readonly actions = new Map<string, MobilePluginAction>();
  readonly host: PluginHost;
  readonly sync = new RendererSyncRegistry();
  readonly upload = new RendererUploadRegistry();
  readonly asr = new ASRProviderRegistry();
  readonly tts = new RendererTTSRegistry();
  websocket?: PluginWebSocket;
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
    readonly navigator: Pick<Navigator, "push">,
    readonly appVersion: string,
    restartRequired?: Set<string>
  ) {
    this.host = new PluginHost({
      workspaceId,
      restartRequired,
      environmentSource: environment,
      storage,
      ai: {
        bind: (...args) => this.aiAdapter().adapter.bind(...args),
        bindCapability: (...args) => this.aiAdapter().adapter.bindCapability(...args),
      },
      mcp: {
        register: (...args) => {
          if (!this.aiMcp) throw new Error("插件 AI 工具尚未就绪");
          return this.aiMcp.adapter.register(...args);
        },
      },
      chat: this.aiChat.adapter,
      flashcards: {
        listDecks: (...args) => this.flashcardAdapter().listDecks(...args),
        createDeck: (...args) => this.flashcardAdapter().createDeck(...args),
        createCard: (...args) => this.flashcardAdapter().createCard(...args),
        openCreate: (...args) => this.flashcardAdapter().openCreate(...args),
        generate: (...args) => this.flashcardAdapter().generate(...args),
        generateAndSave: (...args) => this.flashcardAdapter().generateAndSave(...args),
      },
      entities: {
        create: (...args) => this.ownAdapter().entities.create(...args),
        get: (...args) => this.ownAdapter().entities.get(...args),
        find: (...args) => this.ownAdapter().entities.find(...args),
        query: (...args) => this.ownAdapter().entities.query(...args),
        count: (...args) => this.ownAdapter().entities.count(...args),
        update: (...args) => this.ownAdapter().entities.update(...args),
        delete: (...args) => this.ownAdapter().entities.delete(...args),
        backlinks: (...args) => this.ownAdapter().entities.backlinks(...args),
        registerKind: (context, definition) => this.registerEntityKind(context, definition),
      },
      records: {
        insert: (...args) => this.ownAdapter().records.insert(...args),
        get: (...args) => this.ownAdapter().records.get(...args),
        query: (...args) => this.ownAdapter().records.query(...args),
        count: (...args) => this.ownAdapter().records.count(...args),
        update: (...args) => this.ownAdapter().records.update(...args),
        delete: (...args) => this.ownAdapter().records.delete(...args),
      },
      links: {
        add: (...args) => this.ownAdapter().links.add(...args),
        list: (...args) => this.ownAdapter().links.list(...args),
        remove: (...args) => this.ownAdapter().links.remove(...args),
        reorder: (...args) => this.ownAdapter().links.reorder(...args),
      },
      transaction: {
        reserveEntityId: (...args) => this.ownAdapter().transaction.reserveEntityId(...args),
        commit: (...args) => this.ownAdapter().transaction.commit(...args),
      },
      app: {
        pick: (...args) => this.appAdapter().pick(...args),
        open: (...args) => this.appAdapter().open(...args),
        describe: (...args) => this.appAdapter().describe(...args),
        run: (...args) => this.appAdapter().run(...args),
      },
      events: {
        subscribe: (context, listener) => {
          if (!this.events) throw new Error("插件业务事件尚未就绪");
          return this.events.adapter.subscribe(context, listener);
        },
      },
      data: {
        query: (...args) => this.dataAdapter().query(...args),
        get: (...args) => this.dataAdapter().get(...args),
        create: (...args) => this.dataAdapter().create(...args),
        update: (...args) => this.dataAdapter().update(...args),
        remove: (...args) => this.dataAdapter().remove(...args),
        readContent: (...args) => this.dataAdapter().readContent(...args),
        contentOwners: (...args) => this.dataAdapter().contentOwners(...args),
        editContent: (...args) => this.dataAdapter().editContent(...args),
        notebookResources: (...args) => this.dataAdapter().notebookResources(...args),
        todos: (...args) => this.dataAdapter().todos(...args),
        calendar: (...args) => this.dataAdapter().calendar(...args),
        writeTodo: (...args) => this.dataAdapter().writeTodo(...args),
        writeTodoOccurrence: (...args) => {
          const adapter = this.dataAdapter();
          if (!adapter.writeTodoOccurrence) throw new Error("当前宿主尚未开放周期实例写入");
          return adapter.writeTodoOccurrence(...args);
        },
        writeCalendar: (...args) => this.dataAdapter().writeCalendar(...args),
        projectTree: (...args) => this.dataAdapter().projectTree(...args),
        createDocument: (...args) => this.dataAdapter().createDocument(...args),
        moveDocument: (...args) => this.dataAdapter().moveDocument(...args),
      },
      permissions: {
        query: (context, permission) => this.permissionBroker().query(context, permission),
        ensure: (context, plugin, permissions) =>
          this.permissionBroker().ensure(context, plugin, permissions),
        request: (context, plugin, permissions) =>
          this.permissionBroker().request(context, plugin, permissions),
      },
      actions: {
        register: (context, definition) => {
          const id = `${context.pluginId}:${definition.id}`;
          if (this.actions.has(id)) throw new Error("对象动作已注册");
          const action = { id, context, definition };
          this.actions.set(id, action);
          this.publish();
          return {
            dispose: () => {
              if (this.actions.get(id) !== action) return;
              this.actions.delete(id);
              this.publish();
            },
          };
        },
      },
      sync: this.sync,
      asr: this.asr,
      tts: this.tts,
      websocket: {
        connect: (url, protocols, options) => {
          if (!this.websocket) throw new Error("插件网络尚未就绪");
          return this.websocket.connect(url, protocols, options);
        },
      },
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
          if (
            definition.target &&
            definition.target !== "sync" &&
            definition.target !== "upload" &&
            definition.target !== "asr" &&
            definition.target !== "tts"
          )
            throw new Error("当前移动宿主尚未提供此领域设置");
          const id = `${context.pluginId}:${definition.id}`;
          this.settings.set(id, { context, definition });
          this.publish();
          return {
            id,
            open: async () => {
              if (!this.active(context)) throw new Error("插件设置不可用");
              if (definition.target === "asr" || definition.target === "tts")
                navigator.push("pluginSettings", { id });
              else if (definition.target === "sync")
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
  listActions(kind: PluginActionTargetKind): MobilePluginAction[] {
    if (!["card", "article", "document"].includes(kind)) return [];
    return [...this.actions.values()].filter(
      action => this.active(action.context) && action.definition.targets.includes(kind)
    );
  }
  async runAction(action: MobilePluginAction, target: MobileActionTarget, identity: string) {
    const ref = Object.freeze({ kind: target.kind, id: target.id });
    const check = () => {
      if (!this.listActions(ref.kind).includes(action)) throw new Error("插件动作不可用");
    };
    check();
    if (!this.app) throw new Error("插件内容交互尚未就绪");
    await this.app.grantActionRef(action.context, ref, identity);
    check();
    await action.definition.run(ref);
  }
  private dataAdapter() {
    if (!this.data) throw new Error("插件数据尚未就绪");
    return this.data;
  }
  private aiAdapter() {
    if (!this.ai) throw new Error("AI_UNAVAILABLE：插件 AI 宿主尚未就绪");
    return this.ai;
  }
  getActiveAiPackages() {
    if (!this.skillPackagesAllowed) return [];
    return [...this.aiPackages.values()].filter(
      item =>
        this.skillEligibility.has(item.id) &&
        (item.kind === "skills" ? this.isSkillPackageActive(item.id) : this.isPluginActive(item.id))
    );
  }
  isSkillPackageActive(id: string) {
    return (
      !this.disposed &&
      this.skillPackagesAllowed &&
      this.skillEligibility.has(id) &&
      this.aiPackages.get(id)?.kind === "skills" &&
      !this.host.listPlugins().some(plugin => plugin.id === id)
    );
  }
  revokeSkillPackage(id: string) {
    this.skillInventoryEpoch++;
    if (this.skillEligibility.delete(id)) this.publish();
  }
  async reconcileSkillPackages(packages: readonly MobilePluginPackage[]) {
    if (this.disposed) return;
    const epoch = ++this.skillInventoryEpoch;
    if (!this.skillPackagesAllowed) {
      if (this.skillEligibility.size) {
        this.skillEligibility.clear();
        this.publish();
      }
      return;
    }
    const eligible = new Map<
      string,
      { item: MobilePluginPackage; kind: "plugin" | "skills"; version: string }
    >();
    for (const item of packages) {
      if (
        !item.enabled ||
        !item.artifact ||
        item.error ||
        item.blocked ||
        item.revoked ||
        !item.skillRevision
      )
        continue;
      try {
        const manifest = validateMobilePackageManifest(item.artifact.manifest);
        if (manifest.id !== item.id) continue;
        if (!manifest.skills?.length) continue;
        eligible.set(item.id, {
          item,
          kind: isSkillPackageManifest(manifest) ? "skills" : "plugin",
          version: manifest.version,
        });
      } catch {
        /* 非当前安装清单不具备技能读取资格。 */
      }
    }
    let revoked = false;
    for (const id of this.skillEligibility) {
      const current = this.aiPackages.get(id);
      const next = eligible.get(id);
      if (
        !current ||
        !next ||
        current.kind !== next.kind ||
        current.version !== next.version ||
        current.skillRevision !== next.item.skillRevision
      ) {
        this.skillEligibility.delete(id);
        revoked = true;
      }
    }
    if (revoked) this.publish();
    const skills: MobileAiSkillPackage[] = [];
    for (const { item, kind } of eligible.values()) {
      if (kind !== "skills" || this.host.listPlugins().some(plugin => plugin.id === item.id))
        continue;
      try {
        const revision = item.skillRevision;
        if (!item.artifact) continue;
        const artifact = await verifyMobilePlugin(
          item.artifact,
          this.environment.getSnapshot(),
          this.appVersion
        );
        if (this.disposed || epoch !== this.skillInventoryEpoch) return;
        if (artifact.kind !== "skills" || !revision) continue;
        skills.push({
          id: item.id,
          kind: "skills",
          version: artifact.manifest.version,
          skillRevision: revision,
        });
        this.errors.delete(item.id);
      } catch (error) {
        if (this.disposed || epoch !== this.skillInventoryEpoch) return;
        this.errors.set(item.id, error instanceof Error ? error.message : "Skill 包无效");
      }
    }
    if (this.disposed || epoch !== this.skillInventoryEpoch) return;
    const previous = JSON.stringify(this.getActiveAiPackages());
    for (const [id, current] of this.aiPackages)
      if (current.kind === "skills") this.aiPackages.delete(id);
    for (const current of skills) {
      this.aiPackages.set(current.id, current);
      this.skillEligibility.add(current.id);
    }
    for (const [id, current] of this.aiPackages) {
      const next = eligible.get(id);
      if (
        current.kind === "plugin" &&
        next?.kind === "plugin" &&
        current.version === next.version &&
        current.skillRevision === next.item.skillRevision
      )
        this.skillEligibility.add(id);
    }
    if (previous !== JSON.stringify(this.getActiveAiPackages()) || revoked) {
      this.publish();
      await this.aiSkills?.refresh();
    }
  }
  private flashcardAdapter() {
    if (!this.flashcards) throw new Error("插件闪卡尚未就绪");
    return this.flashcards.adapter;
  }
  private ownAdapter() {
    if (!this.own) throw new Error("插件自有数据尚未就绪");
    return this.own;
  }
  private registerEntityKind(context: PluginContext, definition: PluginOwnEntityKind) {
    const key = JSON.stringify([context.pluginId, definition.kind]);
    const registration = { context, definition };
    const persisted = this.ownAdapter().entities.registerKind(context, definition);
    this.entityKinds.set(key, registration);
    this.publish();
    return {
      dispose: () => {
        persisted.dispose();
        if (this.entityKinds.get(key) === registration) {
          this.entityKinds.delete(key);
          this.publish();
        }
      },
    };
  }
  async openEntityTarget(
    target: import("./app-types").MobilePluginEntityTarget,
    at?: string,
    callerGuard?: () => void
  ) {
    callerGuard?.();
    const registration = this.entityKinds.get(JSON.stringify([target.pluginId, target.entityKind]));
    if (!registration || !this.active(registration.context))
      throw new Error("请先安装并启用此内容所属的插件");
    const live = () => {
      if (
        this.disposed ||
        this.entityKinds.get(JSON.stringify([target.pluginId, target.entityKind])) !==
          registration ||
        !this.active(registration.context)
      )
        throw new Error("插件内容打开入口已失效");
    };
    const entity = await this.ownAdapter().entities.get(registration.context, String(target.id));
    live();
    if (
      !entity ||
      entity.createdAt !== target.createdAt ||
      entity.kind !== target.entityKind ||
      entity.contentRef !== `${target.contentId}:${target.contentCreatedAt}`
    )
      throw new Error("插件内容已删除或身份已变化");
    const pageId = `${target.pluginId}:${registration.definition.open.page}`;
    const page = this.pages.get(pageId);
    if (!page || !this.active(page.context)) throw new Error("插件内容页面尚未注册或已停用");
    const params = normalizePageParams(registration.definition.open.params?.(entity) ?? {});
    const instance =
      page.definition.match === "params"
        ? (page.definition.getId?.(params) ?? JSON.stringify(params))
        : "single";
    if (typeof instance !== "string") throw new Error("页面身份必须是字符串");
    const opened = normalizePageParams(at ? { ...params, at } : params);
    live();
    if (this.pages.get(pageId) !== page) throw new Error("插件内容页面已失效");
    callerGuard?.();
    this.navigator.push("pluginPage", { id: pageId, instance, params: JSON.stringify(opened) });
  }
  private appAdapter() {
    if (!this.app) throw new Error("插件内容交互尚未就绪");
    return this.app.adapter;
  }
  private permissionBroker() {
    if (!this.permissions) throw new Error("插件授权尚未就绪");
    return this.permissions;
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
    validateContent?: (registry: ContentPluginRegistry) => void,
    contentReady?: () => void,
    options: { safeMode?: boolean } = {}
  ) {
    this.skillPackagesAllowed = options.safeMode !== true;
    const definitions = [];
    for (const item of this.skillPackagesAllowed ? packages : []) {
      if (!item.enabled || !item.artifact || item.blocked || item.revoked || item.error) continue;
      try {
        const artifact = await verifyMobilePlugin(
          item.artifact,
          this.environment.getSnapshot(),
          this.appVersion
        );
        if (this.disposed) return;
        if (artifact.manifest.id !== item.id) throw new Error("安装目录与包身份不一致");
        if (artifact.kind === "skills") {
          if (!item.skillRevision) throw new Error("独立 Skill 包缺少已安装版本标识");
          this.aiPackages.set(item.id, {
            id: item.id,
            kind: "skills",
            version: artifact.manifest.version,
            skillRevision: item.skillRevision,
          });
          this.skillEligibility.add(item.id);
          continue;
        }
        const definition = evaluatePortablePluginPackage(artifact, modules, {
          environment: this.environment.getSnapshot(),
          appVersion: this.appVersion,
          profiles: ["web-v1"],
        });
        const contentDefinition = definition;
        const nodeTypes = getPluginNodeTypes(definition);
        const candidate = new ContentPluginRegistry();
        candidate.install([...this.content.list(), contentDefinition]);
        validateContent?.(candidate);
        this.host.registerTrusted({
          ...definition,
          permissions: artifact.manifest.permissions,
          skills: artifact.manifest.skills,
        });
        if (item.skillRevision)
          this.aiPackages.set(item.id, {
            id: item.id,
            kind: "plugin",
            version: artifact.manifest.version,
            skillRevision: item.skillRevision,
          });
        if (item.skillRevision) this.skillEligibility.add(item.id);
        this.content.install(candidate.list());
        nodeTypes.forEach(type => this.elementSupport.set(type, "edit"));
        this.packageNodes.set(item.id, nodeTypes);
        definitions.push(definition);
        if (artifact.css) {
          const style = document.createElement("style");
          style.textContent = artifact.css;
          document.head.append(style);
          this.styles.push(style);
        }
      } catch (error) {
        console.error(`[plugins] 插件加载失败 id=${item.id}`, error);
        this.errors.set(item.id, String(error));
      }
    }
    contentReady?.();
    for (const definition of definitions) {
      if (this.disposed) return;
      try {
        await this.host.enable(definition.id);
      } catch (error) {
        console.error(`[plugins] 插件启用失败 id=${definition.id}`, error);
        this.errors.set(definition.id, String(error));
      }
    }
    await this.aiSkills?.refresh().catch(() => undefined);
    if (this.disposed) return;
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
    this.revokeSkillPackage(id);
    for (const type of this.packageNodes.get(id) ?? []) this.elementSupport.set(type, "none");
    this.errors.set(id, "中心已撤回或禁用此版本，插件已停用；正文保留");
    this.publish();
    if (this.host.listPlugins().some(plugin => plugin.id === id)) await this.host.disable(id);
  }
  async dispose() {
    this.disposed = true;
    this.flashcards?.dispose();
    this.app?.dispose();
    this.own?.dispose();
    this.permissions?.dispose();
    this.data?.dispose();
    this.events?.dispose();
    const hostResults = await Promise.allSettled([this.host.dispose()]);
    const aiResults = await Promise.allSettled([
      Promise.resolve().then(() => this.ai?.dispose()),
      Promise.resolve().then(() => this.aiMcp?.dispose()),
      Promise.resolve().then(() => this.aiSkills?.dispose()),
    ]);
    this.aiChat.dispose();
    this.aiPackages.clear();
    this.skillInventoryEpoch++;
    this.skillEligibility.clear();
    this.unsubscribe();
    this.styles.forEach(style => style.remove());
    this.styles = [];
    this.actions.clear();
    this.pages.clear();
    this.entityKinds.clear();
    this.entries.clear();
    this.settings.clear();
    this.pageStates.clear();
    this.content.install([]);
    this.elementSupport.clear();
    this.publish();
    const errors = [...hostResults, ...aiResults].flatMap(result =>
      result.status === "rejected" ? [result.reason] : []
    );
    if (errors.length) throw new AggregateError(errors, "插件运行时清理失败");
  }
}
