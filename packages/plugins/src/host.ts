import { readNotificationOptions, type PluginNotificationOptions } from "./notifications";
import type { PluginSpeechSession, PluginSpeechStartOptions } from "./speech";
import {
  createPluginEnvironmentStore,
  snapshotPluginEnvironment,
  type PluginEnvironment,
  type PluginEnvironmentSource,
} from "./environment";
import type { PluginNavigationEntry } from "./navigation";
import type {
  Disposable,
  JsonValue,
  PluginCommand,
  PluginContext,
  PluginDefinition,
  PluginInstance,
  PluginSettingsDefinition,
  PluginSettingsHandle,
  PluginSidebarGroupDefinition,
  PluginSidebarGroupHandle,
  PluginSidebarItemDefinition,
  PluginExcerptChange,
  PluginExcerptEntry,
  PluginExcerptItem,
  PluginExcerptProviderDefinition,
  PluginExcerptSource,
  PluginExcerptSourceSummary,
  PluginExcerptSyncResult,
  PluginMaterialAction,
  PluginMaterialRef,
  PluginStorage,
} from "./index";
import { assertLocalId, copyJson } from "./values";
import { assertProviderForm } from "./provider-form";
import {
  sidebarDragType,
  snapshotSidebarUpdate,
  type PluginSidebarItemHandle,
  type PluginSidebarItemState,
  type PluginSidebarItemUpdate,
} from "./sidebar";
import type { PluginHomePanelDefinition, RegisteredHomePanelDefinition } from "./home";
import {
  PLUGIN_ACTION_TARGET_KINDS,
  snapshotActionTarget,
  type PluginActionDefinition,
  type PluginActionTargetKind,
} from "./actions";
import { PLUGIN_ENTITY_PANEL_KINDS, type PluginEntityPanelDefinition } from "./views";
import {
  CONTENT_INPUT_LIMITS,
  EDITOR_NODE_SCHEMA_VERSION,
  readContentInput,
  type PluginContentInput,
} from "./content-input";
import type { SyncProviderDefinition } from "./sync";
import type { UploadFile, UploadProviderDefinition } from "./upload";
import type { TTSProviderDefinition } from "./tts";
import type { ASRProviderDefinition } from "./asr";
import type { PluginWebSocket, PluginSocketOptions } from "./websocket";
import type { ImageProviderDefinition } from "./images";
import type { EmbeddingProviderDefinition } from "./embeddings";
import type { VideoProviderDefinition } from "./video";
import type { PublishProviderDefinition } from "./publish";
export { copyJson } from "./values";
import {
  unavailableAI,
  isPluginAICapability,
  type PluginAIFeatures,
  type PluginAIFeature,
  type PluginAICapability,
  type PluginAICapabilityClient,
  type PluginAICapabilityRequest,
  type PluginAIEvent,
} from "./ai";
import { bindPluginServices, type PluginServices } from "./services";
export { bindPluginServices } from "./services";
import {
  ACTIVATION_TIMEOUT_MS,
  CLEANUP_TIMEOUT_MS,
  LifecycleTimeoutError,
  waitForLifecycle,
} from "./lifecycle";
import { assertStorageActive, type StorageAdapter, type StorageScope } from "./storage";
import { normalizePageParams, type PluginPageDefinition, type PluginPageHandle } from "./pages";
import { snapshotMCPDefinition, snapshotMCPToolResult, type PluginMCPDefinition } from "./mcp";
import { snapshotToolRendererDefinition, type PluginToolRendererDefinition } from "./chat";
import {
  PluginPermissionError,
  type PluginPermission,
  type PluginPermissionState,
} from "./permissions";
import type {
  PluginArticleInput,
  PluginArticlePatch,
  PluginCalendarEvent,
  PluginCalendarInput,
  PluginCalendarPatch,
  PluginCalendarQuery,
  PluginCardInput,
  PluginCardPatch,
  PluginContentEdit,
  PluginContentRef,
  PluginContentSnapshot,
  PluginDocumentInput,
  PluginDocumentMove,
  PluginDocumentPatch,
  PluginProjectInput,
  PluginNotebookResource,
  PluginProjectNode,
  PluginProjectPatch,
  PluginWhiteboardInput,
  PluginWhiteboardPatch,
  PluginEntityQuery,
  PluginPage,
  PluginTodo,
  PluginTodoInput,
  PluginTodoPatch,
  PluginTodoQuery,
  PluginWriteOptions,
} from "./data";
import type {
  PluginOwnEntity,
  PluginOwnEntityBacklink,
  PluginOwnEntityInput,
  PluginOwnEntityKind,
  PluginOwnEntityMeta,
  PluginOwnEntityFilter,
  PluginOwnEntityPatch,
  PluginOwnEntityQuery,
} from "./entities";
import type { PluginLink, PluginLinkData, PluginLinkOptions } from "./links";
import type { PluginTransaction, PluginTransactionWriteOptions } from "./transaction";
import type {
  PluginRecord,
  PluginRecordCollection,
  PluginRecordData,
  PluginRecordFilter,
  PluginRecordQuery,
} from "./records";
import {
  readIndexes,
  readOrderBy,
  readWhere,
  type PluginIndexes,
  type PluginQueryCondition,
  type PluginQueryOrder,
} from "./query";
import {
  PLUGIN_EVENT_PERMISSIONS,
  isPluginEventType,
  type PluginDomainEvent,
  type PluginEventType,
} from "./events";
import {
  PLUGIN_APP_ACTIONS,
  PLUGIN_ENTITY_KINDS,
  PLUGIN_NOTEBOOK_FROM_KINDS,
  PLUGIN_CHAT_CONTEXT_KINDS,
  PLUGIN_ENTITY_READ_PERMISSIONS,
  PLUGIN_EXPORT_FORMATS,
  type PluginAppAction,
  type PluginExportFormat,
  type PluginEntityKind,
  type PluginEntityRef,
  type PluginContentLocation,
  type PluginOpenOptions,
  type PluginPickOptions,
  type PluginPickedEntity,
  type PluginEntityDescription,
} from "./app";
import type { PluginFlashcards } from "./flashcards";

export type FlashcardsAdapter = {
  [K in keyof PluginFlashcards]: (
    context: PluginContext,
    ...args: Parameters<PluginFlashcards[K]>
  ) => ReturnType<PluginFlashcards[K]>;
};
export { createMemoryStorage } from "./storage";
export type { StorageAdapter, StorageScope } from "./storage";
export { createBrowserStorage, clearBrowserPluginStorage } from "./browser-storage";
export { normalizePageParams } from "./pages";
export { validatePluginManifest, PLUGIN_SHARED_MODULES } from "./package";
export { comparePluginVersions, assertPluginCompatibility } from "./version";
export type { PluginManifest, DevelopmentPluginPackage } from "./package";

export interface PagesAdapter {
  register(context: PluginContext, definition: PluginPageDefinition): PluginPageHandle;
}

export interface SettingsAdapter {
  register(context: PluginContext, definition: PluginSettingsDefinition): PluginSettingsHandle;
}

export interface HomeAdapter {
  /** 定义已冻结，size、action 已补成缺省值 */
  registerPanel(context: PluginContext, definition: RegisteredHomePanelDefinition): Disposable;
}

export interface ViewsAdapter {
  /** 定义已冻结，kinds 已去重 */
  registerEntityPanel(
    context: PluginContext,
    definition: Readonly<PluginEntityPanelDefinition>
  ): Disposable;
}

export interface ActionsAdapter {
  /** 定义已冻结；run 已包装，插件停用或动作注销后调用会抛错 */
  register(context: PluginContext, definition: Readonly<PluginActionDefinition>): Disposable;
}

export interface SidebarAdapter {
  registerGroup(
    context: PluginContext,
    definition: PluginSidebarGroupDefinition
  ): PluginSidebarGroupHandle;
  registerItem(
    context: PluginContext,
    definition: PluginSidebarItemDefinition,
    pageId: string
  ): SidebarItemResource;
}

/** 宿主侧的条目资源：update 收到已校验、回调已包装的完整状态 */
export interface SidebarItemResource extends Disposable {
  update(state: PluginSidebarItemState): void;
}
export type { PluginSidebarItemState } from "./sidebar";

/** 宿主负责命名空间（来源类型即插件 ID）与工作区绑定；参数已复制为 JSON。 */
export interface ExcerptsAdapter {
  register(context: PluginContext, definition: PluginExcerptProviderDefinition): Disposable;
  replace(
    context: PluginContext,
    source: PluginExcerptSource,
    items: PluginExcerptItem[]
  ): Promise<PluginExcerptSyncResult>;
  patch(
    context: PluginContext,
    source: PluginExcerptSource,
    change: PluginExcerptChange
  ): Promise<PluginExcerptSyncResult>;
  sources(context: PluginContext): Promise<PluginExcerptSourceSummary[]>;
  items(context: PluginContext, sourceKey: string): Promise<PluginExcerptEntry[]>;
}

/** 业务数据的授权由宿主决定：已获准直接返回，否则询问用户或抛出 PluginPermissionError。 */
export interface PermissionsAdapter {
  subscribe?(listener: () => void): () => void;
  ensure(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ): Promise<void>;
  query(context: PluginContext, permission: PluginPermission): Promise<PluginPermissionState>;
  request(
    context: PluginContext,
    plugin: PluginOwner,
    permissions: readonly PluginPermission[]
  ): Promise<boolean>;
}

export type DataEntity = "card" | "article" | "document" | "whiteboard" | "project";
/** 可读取的实体：DataEntity 之外的 Notebook、材料与对话只读 */
export type ReadableEntity = DataEntity | "notebook" | "material" | "chat-session";
/** 持有正文的实体：正文的访问按它们的权限放行 */
export type ContentOwnerEntity = "card" | "article" | "document";

/** 宿主负责工作区绑定；参数已校验并复制，返回值由 PluginHost 再复制后交给插件。 */
export interface DataAdapter {
  query(
    context: PluginContext,
    entity: ReadableEntity,
    query: Required<Pick<PluginEntityQuery, "limit">> & PluginEntityQuery
  ): Promise<PluginPage<unknown>>;
  get(context: PluginContext, entity: ReadableEntity, id: string): Promise<unknown | null>;
  notebookResources(
    context: PluginContext,
    notebookId: string
  ): Promise<PluginNotebookResource[] | null>;
  todos(
    context: PluginContext,
    query: PluginTodoQuery & { limit: number }
  ): Promise<PluginPage<PluginTodo>>;
  calendar(
    context: PluginContext,
    query: PluginCalendarQuery & { limit: number }
  ): Promise<PluginPage<PluginCalendarEvent>>;
  /** owners 为引用这份正文的实体类型，own 表示是本插件实体的正文；两者都没有时宿主按不存在处理 */
  readContent(
    context: PluginContext,
    ref: PluginContentRef,
    format: "markdown" | "nodes"
  ): Promise<{
    snapshot: PluginContentSnapshot;
    owners: ContentOwnerEntity[];
    own: boolean;
  } | null>;
  /** 以下写入由宿主记录来源插件；revision 不是最新时抛出 PluginConflictError */
  create(
    context: PluginContext,
    entity: CreatableEntity,
    input: PluginCardInput | PluginArticleInput | PluginWhiteboardInput | PluginProjectInput
  ): Promise<unknown>;
  update(
    context: PluginContext,
    entity: DataEntity,
    id: string,
    patch:
      | PluginCardPatch
      | PluginArticlePatch
      | PluginDocumentPatch
      | PluginWhiteboardPatch
      | PluginProjectPatch,
    expectedRevision: string
  ): Promise<unknown>;
  remove(
    context: PluginContext,
    entity: DeletableEntity,
    id: string,
    expectedRevision: string
  ): Promise<void>;
  writeTodo(context: PluginContext, write: TodoWrite): Promise<PluginTodo | null>;
  /** 实例写入独立接线，防止旧宿主忽略实例日期后修改整系列。 */
  writeTodoOccurrence?(
    context: PluginContext,
    write: Exclude<TodoWrite, { action: "create" }>
  ): Promise<PluginTodo | null>;
  writeCalendar(context: PluginContext, write: CalendarWrite): Promise<PluginCalendarEvent | null>;
  /** 正文的所属实体类型与是否为本插件实体的正文，供宿主在写入前校验权限；正文不存在时都为空 */
  contentOwners(
    context: PluginContext,
    ref: PluginContentRef
  ): Promise<{ owners: ContentOwnerEntity[]; own: boolean }>;
  editContent(
    context: PluginContext,
    ref: PluginContentRef,
    edit: PluginContentEdit,
    expectedRevision: string
  ): Promise<{ revision: string }>;
  projectTree(context: PluginContext, projectId: string): Promise<PluginProjectNode[] | null>;
  createDocument(context: PluginContext, input: PluginDocumentInput): Promise<unknown>;
  moveDocument(
    context: PluginContext,
    id: string,
    move: PluginDocumentMove,
    expectedRevision: string
  ): Promise<{ revision: string }>;
}

/** 可删除的实体，删除可在插件详情页恢复 */
export type DeletableEntity = DataEntity;
export type CreatableEntity = "card" | "article" | "whiteboard" | "project";

export type TodoWrite =
  | { action: "create"; input: PluginTodoInput }
  | { action: "update"; id: string; patch: PluginTodoPatch; expectedRevision: string }
  | { action: "complete"; id: string; completed: boolean; expectedRevision: string }
  | { action: "delete"; id: string; expectedRevision: string };

export type CalendarWrite =
  | { action: "create"; input: PluginCalendarInput }
  | { action: "update"; id: string; patch: PluginCalendarPatch; expectedRevision: string }
  | { action: "delete"; id: string; expectedRevision: string };

/** 插件实体的存取：只读写本插件的实体；参数已校验，返回值由 PluginHost 复制后交给插件。 */
/** 校验后的实体查询；kind 的索引声明已代入条件与排序 */
export interface EntityQueryFilter {
  kind?: string;
  where: PluginQueryCondition[];
  titleContains?: string;
}

/** 校验后的新建实体参数 */
export type EntityCreateInput = Required<Omit<PluginOwnEntityInput, "content">> & {
  meta: PluginOwnEntityMeta;
  content?: PluginContentInput;
};

export interface EntitiesAdapter {
  /** indexes：类型声明的索引字段，宿主写入前核对 meta 中对应字段的类型 */
  create(
    context: PluginContext,
    input: EntityCreateInput,
    indexes: PluginIndexes
  ): Promise<PluginOwnEntity>;
  get(context: PluginContext, id: string): Promise<PluginOwnEntity | null>;
  find(context: PluginContext, kind: string, key: string): Promise<PluginOwnEntity | null>;
  query(
    context: PluginContext,
    query: EntityQueryFilter & { orderBy: PluginQueryOrder[]; cursor?: string; limit: number }
  ): Promise<PluginPage<PluginOwnEntity>>;
  count(context: PluginContext, filter: EntityQueryFilter): Promise<number>;
  /** indexes：各已声明类型的索引字段，宿主按实体的类型核对 meta */
  update(
    context: PluginContext,
    id: string,
    patch: PluginOwnEntityPatch,
    expectedRevision: string,
    indexes: Record<string, PluginIndexes>
  ): Promise<PluginOwnEntity>;
  /** 删除后由用户在插件详情页恢复，宿主负责记录可恢复的快照 */
  delete(context: PluginContext, id: string, expectedRevision: string): Promise<void>;
  /** 引用了本插件某项内容的来源；entity 为 null 表示不属于卡片 / 文章 / 项目文档，宿主只计数 */
  backlinks(
    context: PluginContext,
    id: string
  ): Promise<
    Array<{ entity: ContentOwnerEntity | null; id: string } & Omit<PluginOwnEntityBacklink, "ref">>
  >;
  /** 宿主登记类型名、图标与打开方式，供检索结果、打开与 @ 使用；停用时由返回值注销 */
  registerKind?(context: PluginContext, definition: PluginOwnEntityKind): Disposable;
}

/**
 * 插件记录的存取：只读写本插件的记录；参数已校验，indexes 为集合声明的索引字段，
 * 宿主写入前据此核对 data。新记录的 ID 由 PluginHost 生成。
 */
export interface RecordsAdapter {
  insert(
    context: PluginContext,
    collection: string,
    record: { id: string; data: PluginRecordData },
    indexes: PluginIndexes
  ): Promise<PluginRecord>;
  get(context: PluginContext, collection: string, id: string): Promise<PluginRecord | null>;
  query(
    context: PluginContext,
    collection: string,
    query: {
      where: PluginQueryCondition[];
      orderBy: PluginQueryOrder[];
      cursor?: string;
      limit: number;
    }
  ): Promise<PluginPage<PluginRecord>>;
  count(context: PluginContext, collection: string, where: PluginQueryCondition[]): Promise<number>;
  update(
    context: PluginContext,
    collection: string,
    id: string,
    data: PluginRecordData,
    expectedRevision: string,
    indexes: PluginIndexes
  ): Promise<PluginRecord>;
  delete(
    context: PluginContext,
    collection: string,
    id: string,
    expectedRevision: string
  ): Promise<void>;
}

/**
 * 插件关联的存取：来源须是本插件的内容。readable 为插件是否已获准读取目标的类型，
 * 宿主据此与用户选择过的引用判断目标是否可关联。新关联的 ID 由 PluginHost 生成。
 */
export interface LinksAdapter {
  add(
    context: PluginContext,
    link: { id: string; from: string; to: PluginEntityRef; role: string; data: PluginLinkData },
    readable: boolean
  ): Promise<PluginLink>;
  list(context: PluginContext, from: string, role?: string): Promise<PluginLink[]>;
  remove(context: PluginContext, id: string): Promise<void>;
  reorder(context: PluginContext, from: string, ids: string[]): Promise<void>;
}

/** 事务里的一条写入，参数已按单独调用时的规则校验；不带 expectedRevision 即不核对版本 */
export type PluginTransactionOp =
  | { op: "entity.create"; id: string; input: EntityCreateInput; indexes: PluginIndexes }
  | {
      op: "entity.update";
      id: string;
      patch: PluginOwnEntityPatch;
      expectedRevision?: string;
      indexes: Record<string, PluginIndexes>;
    }
  | { op: "entity.delete"; id: string; expectedRevision?: string }
  | {
      op: "record.insert";
      collection: string;
      id: string;
      data: PluginRecordData;
      indexes: PluginIndexes;
    }
  | {
      op: "record.update";
      collection: string;
      id: string;
      data: PluginRecordData;
      expectedRevision?: string;
      indexes: PluginIndexes;
    }
  | { op: "record.delete"; collection: string; id: string; expectedRevision?: string }
  | {
      op: "link.add";
      id: string;
      from: string;
      to: PluginEntityRef;
      role: string;
      data: PluginLinkData;
      readable: boolean;
    }
  | { op: "link.remove"; id: string }
  | { op: "link.reorder"; from: string; ids: string[] };

/** 原子提交：宿主在一个数据库事务里按顺序执行，任何一条失败全部回滚 */
export interface TransactionAdapter {
  /** 预留一个插件内容 ID，供同一事务里新建时使用 */
  reserveEntityId(context: PluginContext): Promise<string>;
  commit(context: PluginContext, ops: PluginTransactionOp[]): Promise<void>;
}

/** 选择与打开由宿主界面完成；参数已校验，返回值由 PluginHost 复制后交给插件。 */
export interface AppAdapter {
  pick(
    context: PluginContext,
    plugin: PluginOwner,
    options: Required<PluginPickOptions>
  ): Promise<PluginPickedEntity[]>;
  open(
    context: PluginContext,
    ref: PluginEntityRef,
    options: { placement: "page" | "window" | "dock"; at?: PluginContentLocation }
  ): Promise<void>;
  /** 界面关闭后返回；新建类返回新内容的引用，取消为 null */
  run(
    context: PluginContext,
    plugin: PluginOwner,
    request: PluginAppRunRequest
  ): Promise<PluginEntityRef | null | void>;
  /**
   * 按 refs 顺序返回描述；readable 为插件已获准读取的类型。宿主另放行用户选择过的引用与本插件
   * 自己的内容，其余返回 denied（permission 由 PluginHost 补上）。
   */
  describe(
    context: PluginContext,
    refs: readonly PluginEntityRef[],
    readable: readonly PluginEntityKind[]
  ): Promise<Array<{ status: "ok"; title: string } | { status: "missing" } | { status: "denied" }>>;
}

const MAX_DESCRIBE = 200;

export type PluginAppRunRequest =
  | { action: "content.export"; ref: PluginContentRef; format: PluginExportFormat }
  | { action: "content.present" | "content.share"; ref: PluginContentRef }
  | { action: "card.create"; content?: PluginContentInput; tags?: string[] }
  | { action: "project.insertDocument"; content: PluginContentInput; title?: string }
  | {
      action: "notebook.create";
      title: string;
      sources: PluginEntityRef[];
      from?: PluginEntityRef;
    }
  | {
      action: "chat.start";
      prompt: string;
      context: PluginEntityRef[];
      placement: "page" | "dock";
    };

/** 新建类动作：宿主返回新内容的引用，用户取消为 null */
const CREATING_ACTIONS = new Set<string>([
  "card.create",
  "project.insertDocument",
  "notebook.create",
  "chat.start",
]);
const chatContextKinds = new Set<string>(PLUGIN_CHAT_CONTEXT_KINDS);
const MAX_CHAT_PROMPT = 20_000;
const MAX_CHAT_CONTEXT = 20;
const notebookFromKinds = new Set<string>(PLUGIN_NOTEBOOK_FROM_KINDS);
const MAX_NOTEBOOK_SOURCES = 200;

const entityKinds = new Set<string>(PLUGIN_ENTITY_KINDS);
const appActions = new Set<string>(PLUGIN_APP_ACTIONS);
const exportFormats = new Set<string>(PLUGIN_EXPORT_FORMATS);

const MAX_ENTITY_META = 64 * 1024;

function readEntityMeta(value: unknown): PluginOwnEntityMeta {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("meta 必须是对象");
  const meta = copyJson(value) as PluginOwnEntityMeta;
  if (JSON.stringify(meta).length > MAX_ENTITY_META) throw new Error("meta 超过 64 KB");
  return meta;
}

function readEntityKind(value: unknown): PluginOwnEntityKind {
  const definition = value as PluginOwnEntityKind | undefined;
  if (!definition || typeof definition !== "object") throw new Error("类型声明无效");
  assertLocalId(definition.kind);
  const page = definition.open?.page;
  if (typeof page !== "string") throw new Error("open.page 无效");
  assertLocalId(page);
  const params = definition.open.params;
  if (params !== undefined && typeof params !== "function")
    throw new Error("open.params 必须是函数");
  if (definition.mentionable !== undefined && typeof definition.mentionable !== "boolean")
    throw new Error("mentionable 无效");
  // React 组件可能是函数，也可能是 memo / forwardRef 包装出的对象
  const icon = definition.icon;
  if (
    icon !== undefined &&
    typeof icon !== "function" &&
    !(icon && typeof icon === "object" && "$$typeof" in icon)
  )
    throw new Error("icon 必须是 SVG 组件");
  return Object.freeze({
    kind: definition.kind,
    label: readText(definition.label, "类型名", 50),
    ...(icon ? { icon } : {}),
    open: Object.freeze({ page, ...(params ? { params } : {}) }),
    mentionable: definition.mentionable ?? false,
    indexes: readIndexes(definition.indexes, ENTITY_SORT_FIELDS),
  });
}

const ENTITY_SORT_FIELDS = ["createdAt", "updatedAt", "title"] as const;
const RECORD_SORT_FIELDS = ["createdAt", "updatedAt"] as const;
const DEFAULT_RECORD_ORDER: PluginQueryOrder[] = [{ builtin: "createdAt", direction: "asc" }];
const MAX_RECORD_DATA = 64 * 1024;

function readRecordData(value: unknown): PluginRecordData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("data 必须是对象");
  const data = copyJson(value) as PluginRecordData;
  if (JSON.stringify(data).length > MAX_RECORD_DATA) throw new Error("data 超过 64 KB");
  return data;
}

const MAX_LINK_DATA = 4 * 1024;
const MAX_TRANSACTION_OPS = 500;

/** 事务里的 revision 可以省略；给了就必须有效 */
function readOptionalRevision(options: unknown): string | undefined {
  if (options === undefined) return undefined;
  if (!options || typeof options !== "object") throw new Error("参数无效");
  const revision = (options as PluginTransactionWriteOptions).expectedRevision;
  return revision === undefined ? undefined : readRevision(options);
}

function readReorderIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_REORDER)
    throw new Error(`ids 必须是 1–${MAX_REORDER} 项的数组`);
  const values = ids.map(readId);
  if (new Set(values).size !== values.length) throw new Error("ids 有重复");
  return values;
}
const MAX_REORDER = 1000;

function readLinkOptions(value: unknown): { role: string; data: PluginLinkData } {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value)))
    throw new Error("参数无效");
  const { role = "", data = {} } = (value ?? {}) as PluginLinkOptions;
  if (role !== "") assertLocalId(role);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("data 必须是对象");
  const copy = copyJson(data) as PluginLinkData;
  if (JSON.stringify(copy).length > MAX_LINK_DATA) throw new Error("data 超过 4 KB");
  return { role, data: copy };
}

function readRecordCollection(value: unknown): Required<PluginRecordCollection> {
  const definition = value as PluginRecordCollection | undefined;
  if (!definition || typeof definition !== "object") throw new Error("集合声明无效");
  assertLocalId(definition.name);
  return Object.freeze({
    name: definition.name,
    indexes: readIndexes(definition.indexes, RECORD_SORT_FIELDS),
  });
}
const DEFAULT_ENTITY_ORDER: PluginQueryOrder[] = [{ builtin: "createdAt", direction: "desc" }];
const MAX_QUERY_CURSOR = 16 * 1024;

function readRunRequest(action: unknown, options: unknown): PluginAppRunRequest {
  if (typeof action !== "string" || !appActions.has(action)) throw new Error("未知的动作");
  if (action === "card.create") {
    const raw = options ?? {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
    const { content, tags } = raw as { content?: unknown; tags?: unknown };
    return {
      action,
      ...(content !== undefined
        ? { content: readContentInput(content, { allowEmpty: true }) }
        : {}),
      ...(tags !== undefined ? { tags: readTags(tags) } : {}),
    };
  }
  if (action === "chat.start") {
    const raw = options ?? {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
    const { prompt, context, placement } = raw as {
      prompt?: unknown;
      context?: unknown;
      placement?: unknown;
    };
    if (context !== undefined && (!Array.isArray(context) || context.length > MAX_CHAT_CONTEXT))
      throw new Error(`context 必须是数组，最多 ${MAX_CHAT_CONTEXT} 项`);
    const refs = (context ?? []).map(readEntityRef);
    if (refs.some(ref => !chatContextKinds.has(ref.kind)))
      throw new Error("对话上下文只支持卡片、文章与项目文档");
    if (placement !== undefined && placement !== "page" && placement !== "dock")
      throw new Error("placement 无效");
    return {
      action,
      prompt: prompt === undefined ? "" : readText(prompt, "提示词", MAX_CHAT_PROMPT, true),
      context: refs,
      placement: placement ?? "page",
    };
  }
  if (action === "notebook.create") {
    const raw = options ?? {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
    const { title, sources, from } = raw as { title?: unknown; sources?: unknown; from?: unknown };
    if (sources !== undefined && (!Array.isArray(sources) || sources.length > MAX_NOTEBOOK_SOURCES))
      throw new Error(`sources 必须是数组，最多 ${MAX_NOTEBOOK_SOURCES} 项`);
    const source = from === undefined ? undefined : readEntityRef(from);
    if (source && !notebookFromKinds.has(source.kind))
      throw new Error("这类内容不能作为 Notebook 的来源");
    return {
      action,
      title: readText(title, "标题", MAX_TITLE),
      sources: (sources ?? []).map(readEntityRef),
      ...(source ? { from: source } : {}),
    };
  }
  if (action === "project.insertDocument") {
    const raw = options ?? {};
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
    const { content, title } = raw as { content?: unknown; title?: unknown };
    if (content === undefined) throw new Error("缺少要插入的正文");
    return {
      action,
      content: readContentInput(content, { allowEmpty: true, share: true }),
      ...(title !== undefined ? { title: readText(title, "标题", MAX_TITLE) } : {}),
    };
  }
  const value = options as { ref?: unknown; format?: unknown } | undefined;
  if (typeof value?.ref !== "string" || !value.ref) throw new Error("正文引用无效");
  if (action !== "content.export")
    return { action: action as "content.present" | "content.share", ref: value.ref };
  if (typeof value.format !== "string" || !exportFormats.has(value.format))
    throw new Error("导出格式无效");
  return { action, ref: value.ref, format: value.format as PluginExportFormat };
}

/** 打开位置与定位按宿主能力限定：独立窗口只开正文实体、停靠栏只开对话、定位只对有正文的内容 */
const WINDOW_KINDS = new Set<string>(["card", "article", "document"]);
const LOCATABLE_KINDS = new Set<string>(["card", "article", "document", "diary", "plugin-entity"]);

function readOpenOptions(
  ref: PluginEntityRef,
  value: unknown
): { placement: "page" | "window" | "dock"; at?: PluginContentLocation } {
  const raw = value ?? {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("打开选项无效");
  const { placement = "page", at } = raw as { placement?: unknown; at?: unknown };
  if (placement !== "page" && placement !== "window" && placement !== "dock")
    throw new Error("placement 无效");
  if (placement === "window" && !WINDOW_KINDS.has(ref.kind))
    throw new Error("只有卡片、文章与项目文档能在独立窗口打开");
  if (placement === "dock" && ref.kind !== "chat-session")
    throw new Error("只有对话能在停靠栏打开");
  if (at === undefined) return { placement };
  const block = (at as { block?: unknown } | null)?.block;
  if (!Number.isSafeInteger(block) || (block as number) < 0) throw new Error("at.block 无效");
  if (!LOCATABLE_KINDS.has(ref.kind)) throw new Error("这类内容不支持定位");
  if (placement === "window") throw new Error("独立窗口不支持定位");
  return { placement, at: { block: block as number } };
}

function readEntityRef(value: unknown): PluginEntityRef {
  const ref = value as PluginEntityRef | undefined;
  if (!ref || !entityKinds.has(ref.kind)) throw new Error("内容类型无效");
  return { kind: ref.kind, id: readId(ref.id) };
}

/**
 * 宿主事件源：只负责投递本工作区的事件，类型与权限过滤由 PluginHost 完成。
 * entity.* 与 record.* 只投递 context 所属插件自己的实体与记录。
 */
export interface EventsAdapter {
  subscribe(context: PluginContext, listener: (event: PluginDomainEvent) => void): Disposable;
}

const ENTITY_PERMISSIONS: Record<ReadableEntity, PluginPermission> = {
  card: "cards:read",
  article: "articles:read",
  document: "documents:read",
  whiteboard: "whiteboards:read",
  project: "projects:read",
  notebook: "notebooks:read",
  material: "materials:read",
  "chat-session": "chats:read",
};
/** 有标签、可按 tag 查询的实体 */
const TAGGED_ENTITIES = new Set<ReadableEntity>(["card", "article", "document", "whiteboard"]);
const WRITE_PERMISSIONS: Record<DataEntity, PluginPermission> = {
  card: "cards:write",
  article: "articles:write",
  document: "documents:write",
  whiteboard: "whiteboards:write",
  project: "projects:write",
};

const MAX_TITLE = 500;
const MAX_DESCRIPTION = 10_000;
/** 各类可修改的字段；description 可清空 */
const PATCH_FIELDS: Record<DataEntity, Record<string, FieldRule>> = {
  card: { tags: "tags", pinned: "boolean" },
  article: { title: MAX_TITLE, tags: "tags", pinned: "boolean" },
  document: { title: MAX_TITLE, tags: "tags" },
  whiteboard: {
    title: MAX_TITLE,
    description: { max: MAX_DESCRIPTION, allowEmpty: true },
    tags: "tags",
  },
  project: { title: MAX_TITLE, archived: "boolean", pinned: "boolean" },
};
/** 访问一份正文所需的权限候选：拥有任一所属实体的读取（写入）权限即可；正文接口与组件层共用。 */
export function contentPermissions(
  owners: readonly ContentOwnerEntity[],
  mode: "read" | "write"
): PluginPermission[] {
  const table = mode === "read" ? ENTITY_PERMISSIONS : WRITE_PERMISSIONS;
  return [...new Set(owners.map(owner => table[owner]))];
}
const DELETE_PERMISSIONS: Record<DeletableEntity, PluginPermission> = {
  card: "cards:delete",
  article: "articles:delete",
  document: "documents:delete",
  whiteboard: "whiteboards:delete",
  project: "projects:delete",
};

const MAX_MARKDOWN = CONTENT_INPUT_LIMITS.markdown;

function readText(value: unknown, name: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > max)
    throw new Error(`${name}无效`);
  return value;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("标签无效");
  return [...new Set(value.map(tag => readText(tag, "标签", 200).trim()))];
}

function readRevision(options: unknown): string {
  const revision = (options as PluginWriteOptions | undefined)?.expectedRevision;
  if (typeof revision !== "string" || !revision) throw new Error("缺少 expectedRevision");
  return revision;
}

function readId(id: unknown): string {
  if (typeof id !== "string" || !id || id.length > 200) throw new Error("ID 无效");
  return id;
}

/** 字段规则：数字为非空字符串的最大长度，对象形式可允许空串；meta 为插件自有内容的 meta */
type FieldRule =
  | number
  | { max: number; allowEmpty: true }
  | "boolean"
  | "tags"
  | "nullable-time"
  | "meta";

/** 按字段表读取输入：string 可带最大长度，tags 为标签数组；required 中的字段必填，至少要有一个字段 */
function readFields<T>(
  value: unknown,
  fields: Record<string, FieldRule>,
  required: readonly string[] = []
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("参数无效");
  const result: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(fields)) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) {
      if (required.includes(key)) throw new Error(`缺少 ${key}`);
      continue;
    }
    if (rule === "boolean") {
      if (typeof item !== "boolean") throw new Error(`${key} 无效`);
      result[key] = item;
    } else if (rule === "meta") result[key] = readEntityMeta(item);
    else if (rule === "tags") result[key] = readTags(item);
    else if (rule === "nullable-time") result[key] = item === null ? null : readText(item, key, 64);
    else if (typeof rule === "object") result[key] = readText(item, key, rule.max, true);
    else result[key] = readText(item, key, rule);
  }
  if (!Object.keys(result).length) throw new Error("没有要修改的字段");
  return result as T;
}

function readDocumentMove(value: unknown): PluginDocumentMove {
  const move = value as Partial<PluginDocumentMove> | undefined;
  if (!move || typeof move !== "object") throw new Error("移动参数无效");
  const parent = (id: unknown) => (id === null ? null : readId(id));
  if (move.from === undefined || move.to === undefined) throw new Error("移动需要 from 与 to");
  if (move.index !== undefined && (!Number.isSafeInteger(move.index) || (move.index as number) < 0))
    throw new Error("index 必须是非负整数");
  return {
    projectId: readId(move.projectId),
    from: parent(move.from),
    to: parent(move.to),
    ...(move.index !== undefined ? { index: move.index } : {}),
  };
}

function readContentEdit(value: unknown): PluginContentEdit {
  const edit = value as PluginContentEdit | undefined;
  switch (edit?.op) {
    case "append":
    case "prepend":
      return { op: edit.op, content: readContentInput(edit.content, { allowEmpty: false }) };
    case "replaceAll":
      return { op: edit.op, content: readContentInput(edit.content, { allowEmpty: true }) };
    case "replaceText":
      return {
        op: edit.op,
        find: readText(edit.find, "find", MAX_MARKDOWN),
        markdown: readText(edit.markdown, "markdown", MAX_MARKDOWN, true),
      };
    default:
      throw new Error("未知的正文修改");
  }
}

function readLimit(value: unknown, max: number): number {
  if (value === undefined) return Math.min(50, max);
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max)
    throw new Error(`limit 必须是 1–${max} 的整数`);
  return value as number;
}

/** 只保留约定字段并校验类型，避免把任意对象透传给宿主命令。 */
function pickQuery<T extends object>(
  value: unknown,
  fields: Record<string, "string" | "number" | "boolean">
): Partial<T> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("查询参数无效");
  const result: Record<string, unknown> = {};
  for (const [key, type] of Object.entries(fields)) {
    const item = (value as Record<string, unknown>)[key];
    if (item === undefined) continue;
    if (typeof item !== type || (type === "number" && !Number.isSafeInteger(item)))
      throw new Error(`查询参数 ${key} 无效`);
    result[key] = item;
  }
  return result as Partial<T>;
}

export interface MaterialsAdapter {
  actions(context: PluginContext, ref: PluginMaterialRef): Promise<PluginMaterialAction[]>;
}

export interface MCPAdapter {
  register(
    context: PluginContext,
    definition: PluginMCPDefinition,
    owner: PluginOwner & { executionIdentity: string }
  ): Disposable;
}

export interface ChatAdapter {
  prepare(
    context: PluginContext,
    definition: PluginToolRendererDefinition
  ): Promise<() => Disposable>;
}

export type PluginState =
  | "disabled"
  | "activating"
  | "active"
  | "deactivating"
  | "failed"
  | "restart-required";

export interface CommandInfo {
  id: string;
  pluginId: string;
  pluginName: string;
  title: string;
}

/** 贡献的归属插件，供宿主展示来源。 */
export interface PluginOwner {
  id: string;
  name: string;
}

/** 插件激活后实际注册的贡献类别，供管理界面展示「此插件提供」。 */
export type PluginContributionKind =
  | "page"
  | "navigation"
  | "sidebar"
  | "command"
  | "settings"
  | "sync"
  | "upload"
  | "tts"
  | "asr"
  | "images"
  | "embeddings"
  | "video"
  | "publish"
  | "mcp"
  | "chat"
  | "skill"
  | "ai"
  | "editor"
  | "whiteboard"
  | "excerpts"
  | "home"
  | "action"
  | "entity-panel";

export interface PluginInfo {
  backend?: import("./package").PluginBackendManifest;
  id: string;
  name: string;
  version: string;
  state: PluginState;
  error?: string;
  /** manifest 声明的业务数据权限上限 */
  permissions?: readonly PluginPermission[];
}

interface Activation {
  context?: PluginContext;
  contributions: Map<PluginContributionKind, number>;
  ai?: PluginAIFeatures;
  controller: AbortController;
  resources: Disposable[];
  instance?: PluginInstance;
  onActivated: Array<() => void>;
  beforeActivated: Array<() => void>;
}

function tally(activation: Activation, kind: PluginContributionKind, delta: number) {
  if (delta) activation.contributions.set(kind, (activation.contributions.get(kind) ?? 0) + delta);
}

type PluginMetadata = Pick<PluginDefinition, "id" | "name" | "version" | "apiVersion"> & {
  readonly backend?: import("./package").PluginBackendManifest;
  readonly permissions?: readonly PluginPermission[];
  /** manifest 声明的包内 Skill 目录；Skill 由宿主从包文件读取，这里只计入贡献。 */
  readonly skills?: readonly string[];
};
type DefinitionResolver = (signal: AbortSignal) => PluginDefinition | Promise<PluginDefinition>;

interface Entry {
  metadata: PluginMetadata;
  resolveDefinition: DefinitionResolver;
  state: PluginState;
  activation?: Activation;
  pending: Promise<void>;
  removing?: boolean;
  error?: string;
}

interface RegisteredCommand {
  info: CommandInfo;
  entry: Entry;
  activation: Activation;
  run: PluginCommand["run"];
}

export interface NotificationsAdapter {
  send(context: PluginContext, plugin: PluginOwner, options: PluginNotificationOptions): Disposable;
}

/** 宿主语音输入：授权已由 PluginHost 检查；signal 在插件停用时同样中止 */
export interface SpeechAdapter {
  unavailableReason(): string | null;
  start(
    context: PluginContext,
    options: { signal: AbortSignal; onPreview(text: string): void }
  ): Promise<PluginSpeechSession>;
}

/** 只接收宿主显式信任的代码；此宿主不提供第三方沙箱或授权界面。 */
export class PluginHost {
  private readonly entries = new Map<string, Entry>();
  private readonly commands = new Map<string, RegisteredCommand>();
  private closed = false;
  private disposal?: Promise<void>;
  private revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly restartRequired: Set<string>;
  private readonly environmentSource: PluginEnvironmentSource | undefined;

  constructor(
    private readonly options: {
      workspaceId: string;
      environment?: PluginEnvironment;
      environmentSource?: PluginEnvironmentSource;
      navigation?: {
        registerEntry(context: PluginContext, definition: PluginNavigationEntry): Disposable;
      };
      backend?: (context: PluginContext) => import("./backend").PluginBackendClient;
      storage: StorageAdapter;
      pages?: PagesAdapter;
      ai?: {
        bind(
          plugin: PluginOwner,
          features: readonly PluginAIFeature[],
          signal: AbortSignal
        ): Promise<PluginAIFeatures>;
        bindCapability?(
          plugin: PluginOwner,
          capability: PluginAICapability,
          signal: AbortSignal
        ): Promise<PluginAICapabilityClient>;
      };
      settings?: SettingsAdapter;
      publish?: {
        register(context: PluginContext, definition: PublishProviderDefinition): Disposable;
      };
      sync?: { register(context: PluginContext, definition: SyncProviderDefinition): Disposable };
      upload?: {
        register(context: PluginContext, definition: UploadProviderDefinition): Disposable;
        uploadRemote?(file: UploadFile, signal: AbortSignal): Promise<string>;
      };
      tts?: { register(context: PluginContext, definition: TTSProviderDefinition): Disposable };
      asr?: { register(context: PluginContext, definition: ASRProviderDefinition): Disposable };
      websocket?: PluginWebSocket;
      images?: {
        register(context: PluginContext, definition: ImageProviderDefinition): Disposable;
      };
      embeddings?: {
        register(context: PluginContext, definition: EmbeddingProviderDefinition): Disposable;
      };
      video?: {
        register(context: PluginContext, definition: VideoProviderDefinition): Disposable;
      };
      sidebar?: SidebarAdapter;
      home?: HomeAdapter;
      actions?: ActionsAdapter;
      views?: ViewsAdapter;
      excerpts?: ExcerptsAdapter;
      materials?: MaterialsAdapter;
      flashcards?: FlashcardsAdapter;
      mcp?: MCPAdapter;
      chat?: ChatAdapter;
      permissions?: PermissionsAdapter;
      entities?: EntitiesAdapter;
      records?: RecordsAdapter;
      links?: LinksAdapter;
      transaction?: TransactionAdapter;
      data?: DataAdapter;
      events?: EventsAdapter;
      app?: AppAdapter;
      notifications?: NotificationsAdapter;
      speech?: SpeechAdapter;
      fetch?: (
        input: RequestInfo | URL,
        init?: RequestInit,
        owner?: { pluginId: string }
      ) => Promise<Response>;
      services?: PluginServices;
      /** 同一运行环境重建宿主时共享，避免旧副作用未结束就重启插件。 */
      restartRequired?: Set<string>;
    }
  ) {
    if (!options.workspaceId.trim()) throw new Error("插件宿主需要明确的工作区身份");
    if (options.environment && options.environmentSource)
      throw new Error("环境快照与环境源不能同时提供");
    this.environmentSource =
      options.environmentSource ??
      (options.environment ? createPluginEnvironmentStore(options.environment) : undefined);
    if (this.environmentSource) snapshotPluginEnvironment(this.environmentSource.getSnapshot());
    this.options = Object.freeze({
      ...options,
      ...(options.environment
        ? { environment: snapshotPluginEnvironment(options.environment) }
        : {}),
    });
    this.restartRequired = options.restartRequired ?? new Set();
  }

  getRevision = (): number => this.revision;

  subscribe = (listener: () => void): (() => void) => {
    if (this.closed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 权限只能随登记声明（本地包来自 manifest），不能由插件运行时追加。 */
  registerTrusted(
    definition: PluginDefinition & Pick<PluginMetadata, "permissions" | "backend" | "skills">
  ): void {
    const snapshot = Object.freeze({ ...definition });
    this.register(definition, () => snapshot);
  }

  /** 包入口在启用时加载，静态贡献与生命周期统一由宿主处理。 */
  registerDeferred(metadata: PluginMetadata, resolveDefinition: DefinitionResolver): void {
    this.register(metadata, resolveDefinition);
  }

  private register(definition: PluginMetadata, resolveDefinition: DefinitionResolver): void {
    this.assertOpen();
    assertLocalId(definition.id);
    if (definition.apiVersion !== 1) throw new Error("不支持的插件 API 版本");
    if (!definition.name.trim() || !definition.version.trim()) throw new Error("插件元信息不完整");
    if (this.entries.has(definition.id)) throw new Error(`插件已注册：${definition.id}`);
    this.entries.set(definition.id, {
      metadata: Object.freeze({
        id: definition.id,
        name: definition.name,
        version: definition.version,
        apiVersion: definition.apiVersion,
        ...(definition.backend ? { backend: structuredClone(definition.backend) } : {}),
        ...(definition.permissions?.length
          ? { permissions: Object.freeze([...definition.permissions]) }
          : {}),
        ...(definition.skills?.length ? { skills: Object.freeze([...definition.skills]) } : {}),
      }),
      resolveDefinition,
      state: this.restartRequired.has(definition.id) ? "restart-required" : "disabled",
      pending: Promise.resolve(),
    });
    this.changed();
  }

  getState(id: string): PluginState {
    return this.entry(id).state;
  }

  /** 仅统计已启用插件；停用后贡献已回收，返回空对象。 */
  listContributions(id: string): Partial<Record<PluginContributionKind, number>> {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== "active" || !entry.activation) return {};
    return Object.fromEntries([...entry.activation.contributions].filter(([, count]) => count > 0));
  }

  listPlugins(): PluginInfo[] {
    return [...this.entries.values()].map(({ metadata, state, error }) => ({
      id: metadata.id,
      name: metadata.name,
      version: metadata.version,
      state,
      ...(error === undefined ? {} : { error }),
      ...(metadata.permissions ? { permissions: metadata.permissions } : {}),
      ...(metadata.backend ? { backend: structuredClone(metadata.backend) } : {}),
    }));
  }

  enable(id: string): Promise<void> {
    this.assertOpen();
    const entry = this.entry(id);
    return this.enqueue(entry, async () => {
      this.assertOpen();
      if (entry.removing) throw new Error("插件正在注销");
      if (this.restartRequired.has(id)) throw new Error("插件清理未能确认完成，请重启应用后再启用");
      if (entry.state === "active") return;
      entry.error = undefined;
      entry.state = "activating";
      this.changed();
      try {
        const activation: Activation = {
          controller: new AbortController(),
          resources: [],
          contributions: new Map(),
          onActivated: [],
          beforeActivated: [],
        };
        entry.activation = activation;
        await waitForLifecycle(
          async () => {
            const definition = await entry.resolveDefinition(activation.controller.signal);
            this.assertActive(entry, activation);
            if (
              definition.id !== entry.metadata.id ||
              definition.name !== entry.metadata.name ||
              definition.version !== entry.metadata.version ||
              definition.apiVersion !== entry.metadata.apiVersion ||
              typeof definition.create !== "function"
            )
              throw new Error("插件定义与登记元信息不一致");
            activation.instance = definition.create();
            if (!activation.instance || typeof activation.instance.activate !== "function")
              throw new Error("插件实例缺少 activate");
            tally(activation, "skill", entry.metadata.skills?.length ?? 0);
            tally(activation, "editor", definition.editorExtensions?.length ?? 0);
            tally(activation, "whiteboard", definition.whiteboardExtensions?.length ?? 0);
            if (definition.ai) {
              const ids = new Set<string>();
              if (!Array.isArray(definition.ai.features) || definition.ai.features.length > 32)
                throw new Error("AI 功能声明无效");
              for (const feature of definition.ai.features) {
                assertLocalId(feature.id);
                if (!feature.name?.trim() || ids.has(feature.id))
                  throw new Error("AI 功能名称或 ID 无效");
                ids.add(feature.id);
              }
              tally(activation, "ai", definition.ai.features.length);
              activation.ai = await this.options.ai?.bind(
                { id: entry.metadata.id, name: entry.metadata.name },
                definition.ai.features,
                activation.controller.signal
              );
              this.assertActive(entry, activation);
            }
            activation.context = this.context(entry, activation);
            return activation.instance.activate(activation.context);
          },
          Date.now() + ACTIVATION_TIMEOUT_MS,
          "激活",
          activation.controller.signal
        );
        this.assertActive(entry, activation);
        for (const validate of activation.beforeActivated.splice(0)) validate();
        entry.state = "active";
        for (const commit of activation.onActivated.splice(0)) commit();
        this.changed();
      } catch (error) {
        if (error instanceof LifecycleTimeoutError) this.restartRequired.add(id);
        const errors = await this.cleanup(entry);
        entry.state = this.restartRequired.has(id) ? "restart-required" : "failed";
        entry.error = error instanceof Error ? error.message : "插件激活失败";
        this.changed();
        if (errors.length) throw new AggregateError([error, ...errors], "插件激活与回收失败");
        throw error;
      }
    });
  }

  disable(id: string): Promise<void> {
    const entry = this.entry(id);
    entry.activation?.controller.abort();
    this.changed();
    return this.enqueue(entry, async () => {
      entry.state = "deactivating";
      const errors = await this.cleanup(entry);
      entry.state = this.restartRequired.has(id) ? "restart-required" : "disabled";
      if (errors.length) entry.error = "插件部分清理失败，需要重启应用";
      else if (entry.state === "disabled") entry.error = undefined;
      this.changed();
      if (errors.length) throw new AggregateError(errors, "插件已停用，但部分清理失败");
    });
  }

  async unregister(id: string): Promise<void> {
    const entry = this.entry(id);
    entry.removing = true;
    try {
      await this.disable(id);
    } finally {
      if (this.entries.get(id) === entry) this.entries.delete(id);
      this.changed();
    }
  }

  listCommands(): CommandInfo[] {
    return [...this.commands.values()]
      .filter(
        command => command.entry.state === "active" && !command.activation.controller.signal.aborted
      )
      .map(command => ({ ...command.info }));
  }

  async executeCommand(id: string, input: JsonValue = null): Promise<JsonValue> {
    this.assertOpen();
    const command = this.commands.get(id);
    if (!command || command.entry.state !== "active") throw new Error(`命令不可用：${id}`);
    this.assertActive(command.entry, command.activation);
    const result = await command.run(copyJson(input));
    // 已提交的外部副作用不会回滚，但旧实例不能继续向调用者交付有效结果。
    this.assertActive(command.entry, command.activation);
    return copyJson(result);
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      const results = await Promise.allSettled(
        [...this.entries.keys()].map(id => this.disable(id))
      );
      this.entries.clear();
      this.listeners.clear();
      const errors = results.flatMap(result =>
        result.status === "rejected" ? [result.reason] : []
      );
      if (errors.length) throw new AggregateError(errors, "插件宿主清理失败");
    })();
    return this.disposal;
  }

  /** 宿主装配静态内容交互时复用同一激活实例的存储；不暴露整个上下文。 */
  getStorage(id: string): PluginStorage {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== "active" || !entry.activation?.context)
      throw new Error(`插件 ${id} 尚未启用或已失活`);
    this.assertActive(entry, entry.activation);
    return entry.activation.context.storage;
  }

  private context(entry: Entry, activation: Activation): PluginContext {
    const navigationIds = new Set<string>();
    const environmentSource = this.environmentSource;
    const pages = new WeakMap<
      PluginPageHandle,
      { id: string; active: () => boolean; navigation: Set<Disposable> }
    >();
    const mcps = new Map<string, PluginMCPDefinition>();
    const toolRenderers = new Set<string>();
    const scope: StorageScope = Object.freeze({
      pluginId: entry.metadata.id,
      workspaceId: this.options.workspaceId,
      signal: activation.controller.signal,
    });
    const register = (resource: Disposable): Disposable => {
      this.assertActive(entry, activation);
      let disposed = false;
      let disposal: Promise<void> | undefined;
      const owned = {
        dispose: () => {
          if (disposed) return disposal;
          disposed = true;
          try {
            disposal = Promise.resolve(resource.dispose());
          } catch (error) {
            disposal = Promise.reject(error);
          }
          // 作者提前调用 dispose 后，宿主仍需跟踪未完成或失败的清理。
          void disposal.catch(() => undefined);
          return disposal;
        },
      };
      activation.resources.push(owned);
      return owned;
    };
    const registerAs = (kind: PluginContributionKind, resource: Disposable): Disposable => {
      const owned = register(resource);
      tally(activation, kind, 1);
      let counted = true;
      return {
        dispose: () => {
          if (counted) {
            counted = false;
            tally(activation, kind, -1);
          }
          return owned.dispose();
        },
      };
    };
    const prepareStorage = (key: string) => {
      this.assertActive(entry, activation);
      assertLocalId(key);
    };
    let excerptProvider: Disposable | undefined;
    const excerptsAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.excerpts) throw new Error("当前宿主不支持摘录");
      return this.options.excerpts;
    };
    const excerptWrite = async <T>(write: (adapter: ExcerptsAdapter) => Promise<T>) => {
      const adapter = excerptsAdapter();
      if (!excerptProvider) throw new Error("写入摘录前须先注册摘录提供方");
      const result = await write(adapter);
      this.assertActive(entry, activation);
      return copyJson(result) as T;
    };
    const owner: PluginOwner = { id: entry.metadata.id, name: entry.metadata.name };
    const declared = new Set<PluginPermission>(entry.metadata.permissions ?? []);
    const permissionsAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.permissions) throw new Error("当前宿主不支持业务数据");
      return this.options.permissions;
    };
    const assertDeclared = (permissions: readonly PluginPermission[]) => {
      for (const permission of permissions)
        if (!declared.has(permission)) throw new PluginPermissionError(permission, "undeclared");
    };
    const guard = async (permission: PluginPermission) => {
      assertDeclared([permission]);
      await permissionsAdapter().ensure(context, owner, [permission]);
      this.assertActive(entry, activation);
    };
    const capabilityClients = new Map<PluginAICapability, Promise<PluginAICapabilityClient>>();
    const requestCapability = async (
      capability: PluginAICapability
    ): Promise<PluginAICapabilityClient> => {
      if (!isPluginAICapability(capability))
        throw new Error("AI_UNDECLARED_CAPABILITY：不支持的宿主 AI 能力");
      const permission: PluginPermission = `ai:${capability}`;
      await guard(permission);
      const binding = this.options.ai?.bindCapability;
      if (!binding) throw new Error("AI_UNAVAILABLE：当前宿主不支持 AI 能力");
      let pending = capabilityClients.get(capability);
      if (!pending) {
        pending = binding
          .call(this.options.ai, owner, capability, activation.controller.signal)
          .catch(error => {
            capabilityClients.delete(capability);
            throw error;
          });
        capabilityClients.set(capability, pending);
      }
      const client = await pending;
      const check = async () => {
        this.assertActive(entry, activation);
        if ((await permissionsAdapter().query(context, permission)) !== "granted")
          throw new PluginPermissionError(permission, "denied");
        this.assertActive(entry, activation);
      };
      await check();
      const stream = async function* (
        request: PluginAICapabilityRequest
      ): AsyncGenerator<PluginAIEvent> {
        const { signal: callerSignal, ...input } = request;
        const snapshot = structuredClone(input);
        const controller = new AbortController();
        const signal = AbortSignal.any([
          activation.controller.signal,
          controller.signal,
          ...(callerSignal ? [callerSignal] : []),
        ]);
        const unsubscribe = permissionsAdapter().subscribe?.(() => {
          void check().catch(error => controller.abort(error));
        });
        try {
          await check();
          signal.throwIfAborted();
          for await (const event of client.stream({ ...snapshot, signal })) {
            await check();
            signal.throwIfAborted();
            yield structuredClone(event);
          }
          signal.throwIfAborted();
        } finally {
          unsubscribe?.();
        }
      };
      return Object.freeze({
        stream,
        async chat(request: PluginAICapabilityRequest) {
          for await (const event of stream(request)) if (event.type === "done") return event.result;
          throw new Error("AI_REQUEST_FAILED");
        },
      });
    };
    const dataAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.data) throw new Error("当前宿主不支持业务数据");
      return this.options.data;
    };
    const writeTodo = (write: TodoWrite) => {
      const adapter = dataAdapter();
      if (write.action !== "create" && /@\d{4}-\d{2}-\d{2}$/.test(write.id)) {
        if (!adapter.writeTodoOccurrence)
          throw new Error("当前宿主尚未开放周期实例写入，未修改整系列");
        return adapter.writeTodoOccurrence(context, write);
      }
      return adapter.writeTodo(context, write);
    };
    const entityKindDefinitions = new Map<string, PluginOwnEntityKind>();
    const recordCollections = new Map<string, Required<PluginRecordCollection>>();
    const linksAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.links) throw new Error("当前宿主不支持插件关联");
      return this.options.links;
    };
    const recordsAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.records) throw new Error("当前宿主不支持插件记录");
      return this.options.records;
    };
    const collectionOf = (name: unknown) => {
      if (typeof name !== "string") throw new Error("集合名无效");
      const collection = recordCollections.get(name);
      if (!collection) throw new Error(`集合 ${name} 未声明，请先 registerCollection`);
      return collection;
    };
    const entitiesAdapter = () => {
      this.assertActive(entry, activation);
      if (!this.options.entities) throw new Error("当前宿主不支持插件内容");
      return this.options.entities;
    };
    const kindIndexes = (kind: string): PluginIndexes =>
      entityKindDefinitions.get(kind)?.indexes ?? {};
    const allKindIndexes = (): Record<string, PluginIndexes> =>
      Object.fromEntries(
        [...entityKindDefinitions].map(([kind, definition]) => [kind, definition.indexes ?? {}])
      );
    const readEntityCreate = (input: unknown) => {
      const value = readFields<PluginOwnEntityInput>(
        input,
        { kind: 128, key: 200, title: MAX_TITLE, meta: "meta" },
        ["kind", "key"]
      );
      if (!entityKindDefinitions.has(value.kind))
        throw new Error(`类型 ${value.kind} 未声明，请先 registerKind`);
      const content = (input as PluginOwnEntityInput).content;
      return {
        input: {
          kind: value.kind,
          key: value.key,
          title: value.title ?? "",
          meta: value.meta ?? {},
          ...(content !== undefined
            ? { content: readContentInput(content, { allowEmpty: true }) }
            : {}),
        } as EntityCreateInput,
        indexes: kindIndexes(value.kind),
      };
    };
    const readEntityPatch = (patch: unknown): PluginOwnEntityPatch =>
      readFields<PluginOwnEntityPatch>(patch, { title: MAX_TITLE, meta: "meta" });
    const readLinkAdd = async (from: unknown, to: unknown, options: unknown) => {
      const target = readEntityRef(to);
      const { role, data } = readLinkOptions(options);
      const permission = PLUGIN_ENTITY_READ_PERMISSIONS[target.kind];
      // 只查询已有授权，不弹窗
      const readable = Boolean(
        permission &&
        declared.has(permission) &&
        (await permissionsAdapter().query(context, permission)) === "granted"
      );
      return { from: readId(from), to: target, role, data, readable };
    };
    const readEntityFilter = (filter: PluginOwnEntityFilter | undefined): EntityQueryFilter => {
      if (filter !== undefined && (!filter || typeof filter !== "object"))
        throw new Error("参数无效");
      const { kind, where, titleContains } = filter ?? {};
      if (kind !== undefined) readText(kind, "kind", 128);
      if (titleContains !== undefined) readText(titleContains, "titleContains", 200, true);
      if (where !== undefined && kind === undefined) throw new Error("按字段筛选需要同时给出 kind");
      return {
        ...(kind === undefined ? {} : { kind }),
        where: kind === undefined ? [] : readWhere(where, kindIndexes(kind)),
        ...(titleContains ? { titleContains } : {}),
      };
    };
    const deliver = <T>(value: unknown): T => {
      this.assertActive(entry, activation);
      return copyJson(value) as unknown as T;
    };
    const updater = (entity: DataEntity) => ({
      update: async (id: string, patch: unknown, options: PluginWriteOptions) => {
        const value = readFields<PluginCardPatch>(patch, PATCH_FIELDS[entity]);
        const revision = readRevision(options);
        await guard(WRITE_PERMISSIONS[entity]);
        return deliver<never>(
          await dataAdapter().update(context, entity, readId(id), value, revision)
        );
      },
    });
    const reader = (entity: ReadableEntity) =>
      Object.freeze({
        get: async (id: string) => {
          if (typeof id !== "string" || !id) throw new Error("实体 ID 无效");
          await guard(ENTITY_PERMISSIONS[entity]);
          return deliver<never>(await dataAdapter().get(context, entity, id));
        },
        query: async (query?: PluginEntityQuery) => {
          const picked = pickQuery<PluginEntityQuery>(query, {
            createdAfter: "number",
            createdBefore: "number",
            updatedAfter: "number",
            updatedBefore: "number",
            tag: "string",
            sort: "string",
            cursor: "string",
          });
          if (picked.sort !== undefined && picked.sort !== "created" && picked.sort !== "updated")
            throw new Error("查询参数 sort 无效");
          if (!TAGGED_ENTITIES.has(entity) && picked.tag !== undefined)
            throw new Error("这类内容没有标签，不能按 tag 查询");
          const limit = readLimit((query as PluginEntityQuery | undefined)?.limit, 200);
          await guard(ENTITY_PERMISSIONS[entity]);
          return deliver<never>(await dataAdapter().query(context, entity, { ...picked, limit }));
        },
      });
    const creator = (entity: CreatableEntity) => ({
      create: async (input: unknown) => {
        const raw = input ?? {};
        if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
        if (entity === "whiteboard" || entity === "project") {
          const value = readFields<PluginWhiteboardInput | PluginProjectInput>(
            raw,
            entity === "whiteboard"
              ? { title: MAX_TITLE, description: PATCH_FIELDS.whiteboard.description, tags: "tags" }
              : { title: MAX_TITLE },
            ["title"]
          );
          await guard(WRITE_PERMISSIONS[entity]);
          return deliver<never>(await dataAdapter().create(context, entity, value));
        }
        const { content, ...fields } = raw as Record<string, unknown>;
        const value: PluginCardInput | PluginArticleInput =
          entity === "card"
            ? Object.keys(fields).length
              ? readFields<PluginCardInput>(fields, { tags: "tags", pinned: "boolean" })
              : {}
            : readFields<PluginArticleInput>(fields, { title: MAX_TITLE, tags: "tags" }, ["title"]);
        // copyOf、shareOf 只核对目标的写入权限：正文不离开用户的库，插件也拿不到内容
        if (content !== undefined)
          value.content = readContentInput(content, { allowEmpty: true, share: true });
        await guard(WRITE_PERMISSIONS[entity]);
        return deliver<never>(await dataAdapter().create(context, entity, value));
      },
    });
    const remover = (entity: DeletableEntity) => ({
      delete: async (id: string, options: PluginWriteOptions) => {
        const revision = readRevision(options);
        await guard(DELETE_PERMISSIONS[entity]);
        await dataAdapter().remove(context, entity, readId(id), revision);
        this.assertActive(entry, activation);
      },
    });
    let backendClient: import("./backend").PluginBackendClient | undefined;
    const backend = () => {
      this.assertActive(entry, activation);
      if (!this.options.backend) throw new Error("当前宿主不支持插件后台");
      return (backendClient ??= this.options.backend(context));
    };
    const context: PluginContext = {
      get environment() {
        if (!environmentSource) throw new Error("当前宿主未提供插件环境");
        return environmentSource.getSnapshot();
      },
      navigation: Object.freeze({
        registerEntry: (definition: PluginNavigationEntry) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("功能入口标题不能为空");
          if (navigationIds.has(definition.id)) throw new Error("功能入口重复注册");
          const page = pages.get(definition.page);
          if (!page?.active()) throw new Error("功能入口必须关联本插件有效页面");
          if (!this.options.navigation) throw new Error("当前宿主不支持功能入口");
          const handle = this.options.navigation.registerEntry(
            context,
            Object.freeze({
              ...definition,
              params: Object.freeze(normalizePageParams(definition.params ?? {})),
            })
          );
          navigationIds.add(definition.id);
          const owned = registerAs("navigation", {
            dispose: () => {
              navigationIds.delete(definition.id);
              page.navigation.delete(owned);
              return handle.dispose();
            },
          });
          page.navigation.add(owned);
          return owned;
        },
      }),
      backend: Object.freeze<import("./backend").PluginBackendClient>({
        call: async (method, input, options) => {
          const result = await backend().call(method, copyJson(input), options);
          this.assertActive(entry, activation);
          return copyJson(result);
        },
        subscribe: (event, listener) => register(backend().subscribe(event, listener)),
        getState: async () => backend().getState(),
      }),
      pluginId: scope.pluginId,
      publish: Object.freeze({
        register: (definition: PublishProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("发布提供方必须属于当前插件");
          if (!this.options.publish) throw new Error("当前宿主不支持发布提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "publish",
            this.options.publish.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: config => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("发布插件尚未激活");
                return create(copyJson(config));
              },
            })
          );
        },
      }),
      images: Object.freeze({
        register: (definition: ImageProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("图片提供方必须属于当前插件");
          if (!this.options.images) throw new Error("当前宿主不支持图片提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "images",
            this.options.images.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("图片插件尚未激活");
                return create(copyJson(config), modelId);
              },
            })
          );
        },
      }),
      embeddings: Object.freeze({
        register: (definition: EmbeddingProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("嵌入提供方必须属于当前插件");
          if (
            definition.maxBatchSize !== undefined &&
            (!Number.isInteger(definition.maxBatchSize) || definition.maxBatchSize < 1)
          )
            throw new Error("嵌入提供方单批上限必须是正整数");
          if (!this.options.embeddings) throw new Error("当前宿主不支持嵌入提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "embeddings",
            this.options.embeddings.register(context, {
              id: scope.pluginId,
              name: definition.name,
              maxBatchSize: definition.maxBatchSize,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("嵌入插件尚未激活");
                return create(copyJson(config), modelId);
              },
            })
          );
        },
      }),
      video: Object.freeze({
        register: (definition: VideoProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("视频提供方必须属于当前插件");
          if (!this.options.video) throw new Error("当前宿主不支持视频提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "video",
            this.options.video.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: config => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("视频插件尚未激活");
                const instance = create(copyJson(config));
                for (const method of ["matches", "resolve", "cacheKey", "getPlayback"] as const)
                  if (typeof instance?.[method] !== "function")
                    throw new Error(`视频提供方缺少 ${method} 方法`);
                return instance;
              },
            })
          );
        },
      }),
      asr: Object.freeze({
        register: (definition: ASRProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("识别提供方必须属于当前插件");
          if (!this.options.asr) throw new Error("当前宿主不支持语音识别插件");
          return registerAs(
            "asr",
            this.options.asr.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("识别插件尚未激活");
                const instance = definition.create(copyJson(config), modelId);
                if (
                  typeof instance?.probe !== "function" ||
                  (!instance.openStream && !instance.transcribeFile)
                )
                  throw new Error("识别提供方实现不完整");
                return instance;
              },
            })
          );
        },
      }),
      websocket: Object.freeze({
        connect: (
          url: string,
          protocols: string | string[] = [],
          options: PluginSocketOptions = {}
        ) => {
          this.assertActive(entry, activation);
          if (!this.options.websocket) throw new Error("当前宿主不支持 WebSocket");
          const signal = AbortSignal.any([
            scope.signal,
            ...(options.signal ? [options.signal] : []),
          ]);
          return this.options.websocket.connect(url, protocols, { ...options, signal });
        },
      }),
      tts: Object.freeze({
        register: (definition: TTSProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("语音提供方必须属于当前插件");
          if (!this.options.tts) throw new Error("当前宿主不支持语音提供方");
          const create = definition.create.bind(definition);
          return registerAs(
            "tts",
            this.options.tts.register(context, {
              id: scope.pluginId,
              name: definition.name,
              create: (config, modelId) => {
                this.assertActive(entry, activation);
                if (entry.state !== "active") throw new Error("语音插件尚未激活");
                return create(copyJson(config), modelId);
              },
            })
          );
        },
      }),
      upload: Object.freeze({
        uploadRemote: async (file: UploadFile, options?: { signal?: AbortSignal }) => {
          this.assertActive(entry, activation);
          const uploadRemote = this.options.upload?.uploadRemote;
          if (!uploadRemote) throw new Error("当前宿主不支持远端上传");
          const signal = AbortSignal.any([
            scope.signal,
            ...(options?.signal ? [options.signal] : []),
          ]);
          signal.throwIfAborted();
          const url = await uploadRemote(
            { ...file, content: new Uint8Array(file.content) },
            signal
          );
          signal.throwIfAborted();
          this.assertActive(entry, activation);
          return url;
        },
        register: (definition: UploadProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.upload !== "function"
          )
            throw new Error("上传提供方必须属于当前插件");
          if (!this.options.upload) throw new Error("当前宿主不支持资源上传提供方");
          const upload = definition.upload.bind(definition);
          return registerAs(
            "upload",
            this.options.upload.register(
              context,
              Object.freeze({
                id: scope.pluginId,
                name: definition.name,
                upload: async (file: UploadFile, config: JsonValue, signal: AbortSignal) => {
                  this.assertActive(entry, activation);
                  if (entry.state !== "active") throw new Error("上传插件尚未激活");
                  const executionSignal = AbortSignal.any([scope.signal, signal]);
                  executionSignal.throwIfAborted();
                  const result = await upload(file, config, executionSignal);
                  executionSignal.throwIfAborted();
                  this.assertActive(entry, activation);
                  const url = new URL(result);
                  if (!["http:", "https:"].includes(url.protocol))
                    throw new Error("上传插件必须返回HTTP(S)资源地址");
                  return result;
                },
              })
            )
          );
        },
      }),
      sync: Object.freeze({
        register: (definition: SyncProviderDefinition) => {
          this.assertActive(entry, activation);
          if (
            definition.id !== scope.pluginId ||
            !definition.name.trim() ||
            typeof definition.create !== "function"
          )
            throw new Error("同步提供方必须属于当前插件");
          if (!this.options.sync) throw new Error("当前宿主不支持同步提供方");
          return registerAs(
            "sync",
            this.options.sync.register(context, Object.freeze({ ...definition }))
          );
        },
      }),
      workspaceId: scope.workspaceId,
      signal: scope.signal,
      register,
      ai: Object.freeze({ ...(activation.ai ?? unavailableAI), requestCapability }),
      chat: Object.freeze({
        registerToolRenderer: async (definition: PluginToolRendererDefinition) => {
          this.assertActive(entry, activation);
          const declared = snapshotToolRendererDefinition(definition);
          const adapter = this.options.chat;
          if (!adapter) throw new Error("当前宿主不支持聊天工具渲染");
          const key = JSON.stringify([declared.mcpId, declared.toolName]);
          if (toolRenderers.has(key)) throw new Error("工具渲染器已注册");
          toolRenderers.add(key);
          const local = new AbortController();
          const signal = AbortSignal.any([scope.signal, local.signal]);
          let resource: Disposable | undefined;
          const owned = registerAs("chat", {
            dispose: () => {
              local.abort();
              toolRenderers.delete(key);
              return resource?.dispose();
            },
          });
          const validate = () => {
            if (signal.aborted) return;
            const mcp = mcps.get(declared.mcpId);
            if (!mcp || (mcp.tools && !mcp.tools.some(tool => tool.name === declared.toolName)))
              throw new Error("工具渲染器只能绑定本插件已注册的 MCP 工具");
          };
          try {
            const commit = await adapter.prepare({ ...context, signal }, declared);
            this.assertActive(entry, activation);
            signal.throwIfAborted();
            if (entry.state === "active") {
              validate();
              resource = commit();
            } else {
              activation.beforeActivated.push(validate);
              activation.onActivated.push(() => {
                if (!signal.aborted) resource = commit();
              });
            }
            return owned;
          } catch (error) {
            await owned.dispose();
            throw error;
          }
        },
      }),
      mcp: Object.freeze({
        register: (definition: PluginMCPDefinition) => {
          this.assertActive(entry, activation);
          const declared = snapshotMCPDefinition(definition);
          if (declared.transport?.type === "stdio") {
            const transport = declared.transport;
            const backend = entry.metadata.backend;
            if (
              !backend?.systemAccess.includes("process") ||
              !backend.tools?.some(
                tool =>
                  tool.command === transport.command &&
                  (tool.args ?? []).every((arg, index) => transport.args?.[index] === arg)
              )
            )
              throw new Error("插件 stdio MCP 必须在 backend.tools 声明外部程序并获得后台授权");
          }
          const adapter = this.options.mcp;
          if (!adapter) throw new Error("当前宿主不支持 MCP");
          if (mcps.has(definition.id)) throw new Error("MCP 已注册");
          const local = new AbortController();
          const signal = AbortSignal.any([scope.signal, local.signal]);
          const snapshot: PluginMCPDefinition = declared.transport
            ? declared
            : {
                ...declared,
                tools: declared.tools.map(tool => ({
                  ...tool,
                  execute: async (args, call) => {
                    this.assertActive(entry, activation);
                    signal.throwIfAborted();
                    if (entry.state !== "active") throw new Error("插件尚未激活");
                    const executionSignal = AbortSignal.any([signal, call.signal]);
                    executionSignal.throwIfAborted();
                    const result = await tool.execute(copyJson(args) as typeof args, {
                      signal: executionSignal,
                    });
                    executionSignal.throwIfAborted();
                    this.assertActive(entry, activation);
                    return snapshotMCPToolResult(result);
                  },
                })),
              };
          mcps.set(definition.id, declared);
          let resource: Disposable | undefined;
          const commit = () => {
            if (signal.aborted) return;
            resource = adapter.register({ ...context, signal }, snapshot, {
              id: scope.pluginId,
              name: entry.metadata.name,
              executionIdentity: crypto.randomUUID(),
            });
          };
          const owned = registerAs("mcp", {
            dispose: () => {
              local.abort();
              mcps.delete(definition.id);
              return resource?.dispose();
            },
          });
          if (entry.state === "active") {
            try {
              commit();
            } catch (error) {
              void owned.dispose();
              throw error;
            }
          } else activation.onActivated.push(commit);
          return owned;
        },
      }),
      services: bindPluginServices(this.options.services, scope.signal, () =>
        this.assertActive(entry, activation)
      ),
      fetch: async (input, init) => {
        this.assertActive(entry, activation);
        const execute = this.options.fetch;
        if (!execute) throw new Error("当前宿主不支持 fetch");
        const source =
          init?.signal === undefined && input instanceof Request ? input.signal : init?.signal;
        const signal = AbortSignal.any([scope.signal, ...(source ? [source] : [])]);
        const response = await execute(input, { ...init, signal }, { pluginId: entry.metadata.id });
        if (signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          signal.throwIfAborted();
        }
        this.assertActive(entry, activation);
        return response;
      },
      settings: Object.freeze({
        register: (definition: PluginSettingsDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("设置分区标题不能为空");
          if (definition.form) {
            if (!definition.target) throw new Error("form 需要声明提供方目标");
            if (definition.component) throw new Error("设置分区不能同时声明 form 与组件");
            assertProviderForm(definition.form);
          } else if (typeof definition.component !== "function")
            throw new Error("设置分区缺少组件");
          if (!this.options.settings) throw new Error("当前宿主不支持设置分区");
          const handle = this.options.settings.register(context, Object.freeze({ ...definition }));
          let disposed = false;
          const resource = registerAs("settings", {
            dispose: () => {
              disposed = true;
              return handle.dispose();
            },
          });
          return Object.freeze({
            id: handle.id,
            open: async () => {
              this.assertActive(entry, activation);
              if (disposed) throw new Error("设置分区已注销");
              await handle.open();
            },
            dispose: resource.dispose,
          });
        },
      }),
      commands: Object.freeze({
        register: (command: PluginCommand) => {
          this.assertActive(entry, activation);
          assertLocalId(command.id);
          if (!command.title.trim()) throw new Error("命令标题不能为空");
          const id = `${scope.pluginId}:${command.id}`;
          if (this.commands.has(id)) throw new Error(`命令已注册：${id}`);
          const value = {
            info: {
              id,
              pluginId: scope.pluginId,
              pluginName: entry.metadata.name,
              title: command.title,
            },
            entry,
            activation,
            run: command.run,
          };
          this.commands.set(id, value);
          this.changed();
          return registerAs("command", {
            dispose: () => {
              if (this.commands.get(id) === value) this.commands.delete(id);
              this.changed();
            },
          });
        },
      }),
      storage: Object.freeze({
        get: async (key: string) => {
          prepareStorage(key);
          const value = await this.options.storage.get(scope, key);
          this.assertActive(entry, activation);
          return value === undefined ? undefined : copyJson(value);
        },
        set: async (key: string, value: JsonValue) => {
          prepareStorage(key);
          await this.options.storage.set(scope, key, copyJson(value));
        },
        delete: async (key: string) => {
          prepareStorage(key);
          await this.options.storage.delete(scope, key);
        },
      }),
      excerpts: Object.freeze({
        register: (definition: PluginExcerptProviderDefinition) => {
          const adapter = excerptsAdapter();
          if (excerptProvider) throw new Error("摘录提供方已注册");
          if (typeof definition.label !== "string" || !definition.label.trim())
            throw new Error("摘录提供方名称不能为空");
          if (definition.open !== undefined && typeof definition.open !== "function")
            throw new Error("摘录提供方 open 必须是函数");
          const handle = adapter.register(context, Object.freeze({ ...definition }));
          const owned = registerAs("excerpts", {
            dispose: () => {
              if (excerptProvider === owned) excerptProvider = undefined;
              return handle.dispose();
            },
          });
          excerptProvider = owned;
          return owned;
        },
        replace: (source: PluginExcerptSource, items: PluginExcerptItem[]) =>
          excerptWrite(adapter =>
            adapter.replace(
              context,
              copyJson(source) as unknown as PluginExcerptSource,
              copyJson(items) as unknown as PluginExcerptItem[]
            )
          ),
        patch: (source: PluginExcerptSource, change: PluginExcerptChange) =>
          excerptWrite(adapter =>
            adapter.patch(
              context,
              copyJson(source) as unknown as PluginExcerptSource,
              copyJson(change) as unknown as PluginExcerptChange
            )
          ),
        sources: async () => {
          const result = await excerptsAdapter().sources(context);
          this.assertActive(entry, activation);
          return copyJson(result) as unknown as PluginExcerptSourceSummary[];
        },
        items: async (sourceKey: string) => {
          if (typeof sourceKey !== "string" || !sourceKey) throw new Error("摘录来源无效");
          const result = await excerptsAdapter().items(context, sourceKey);
          this.assertActive(entry, activation);
          return copyJson(result) as unknown as PluginExcerptEntry[];
        },
      }),
      flashcards: Object.freeze(
        Object.fromEntries(
          (
            [
              "listDecks",
              "createDeck",
              "createCard",
              "openCreate",
              "generate",
              "generateAndSave",
            ] as const
          ).map(method => [
            method,
            async (...args: unknown[]) => {
              this.assertActive(entry, activation);
              const snapshot = structuredClone(args);
              if (method === "listDecks") await guard("flashcards:read");
              if (
                method === "createDeck" ||
                method === "createCard" ||
                method === "generateAndSave"
              )
                await guard("flashcards:write");
              const adapter = this.options.flashcards;
              if (!adapter) throw new Error("当前宿主不支持闪卡");
              const call = adapter[method] as (
                context: PluginContext,
                ...args: unknown[]
              ) => Promise<unknown>;
              const result = await call(context, ...snapshot);
              this.assertActive(entry, activation);
              return structuredClone(result);
            },
          ])
        )
      ) as unknown as PluginFlashcards,
      materials: Object.freeze({
        actions: async (ref: PluginMaterialRef) => {
          this.assertActive(entry, activation);
          if (!this.options.materials) throw new Error("当前宿主不支持材料动作");
          const actions = await this.options.materials.actions(
            context,
            copyJson(ref) as unknown as PluginMaterialRef
          );
          this.assertActive(entry, activation);
          return actions.map(action =>
            Object.freeze({
              id: action.id,
              label: action.label,
              run: async () => {
                this.assertActive(entry, activation);
                await action.run();
              },
            })
          );
        },
      }),
      permissions: Object.freeze({
        query: async (permission: PluginPermission) => {
          if (!declared.has(permission)) return "denied" as const;
          const state = await permissionsAdapter().query(context, permission);
          this.assertActive(entry, activation);
          return state;
        },
        request: async (permissions: readonly PluginPermission[]) => {
          if (!Array.isArray(permissions) || !permissions.length) throw new Error("请指定权限");
          assertDeclared(permissions);
          const granted = await permissionsAdapter().request(context, owner, [
            ...new Set(permissions),
          ]);
          this.assertActive(entry, activation);
          return granted;
        },
      }),
      data: Object.freeze({
        cards: Object.freeze({
          ...reader("card"),
          ...updater("card"),
          ...creator("card"),
          ...remover("card"),
        }),
        articles: Object.freeze({
          ...reader("article"),
          ...updater("article"),
          ...creator("article"),
          ...remover("article"),
        }),
        whiteboards: Object.freeze({
          ...reader("whiteboard"),
          ...updater("whiteboard"),
          ...creator("whiteboard"),
          ...remover("whiteboard"),
        }),
        projects: Object.freeze({
          ...reader("project"),
          ...updater("project"),
          ...creator("project"),
          ...remover("project"),
          tree: async (id: string) => {
            const projectId = readId(id);
            await guard(ENTITY_PERMISSIONS.project);
            return deliver<PluginProjectNode[] | null>(
              await dataAdapter().projectTree(context, projectId)
            );
          },
        }),
        notebooks: Object.freeze({
          ...reader("notebook"),
          resources: async (id: string) => {
            const notebookId = readId(id);
            await guard(ENTITY_PERMISSIONS.notebook);
            return deliver<PluginNotebookResource[] | null>(
              await dataAdapter().notebookResources(context, notebookId)
            );
          },
        }),
        materials: reader("material"),
        chats: reader("chat-session"),
        documents: Object.freeze({
          ...reader("document"),
          ...updater("document"),
          ...remover("document"),
          create: async (input: unknown) => {
            const raw = (input ?? {}) as Record<string, unknown>;
            if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("参数无效");
            const { content, projectId, parentId, ...fields } = raw;
            const value: PluginDocumentInput = {
              ...readFields<Pick<PluginDocumentInput, "title" | "tags">>(
                fields,
                { title: MAX_TITLE, tags: "tags" },
                ["title"]
              ),
              projectId: readId(projectId),
              ...(parentId !== undefined ? { parentId: readId(parentId) } : {}),
              ...(content !== undefined
                ? { content: readContentInput(content, { allowEmpty: true, share: true }) }
                : {}),
            };
            await guard(WRITE_PERMISSIONS.document);
            return deliver<never>(await dataAdapter().createDocument(context, value));
          },
          move: async (id: string, move: unknown, options: PluginWriteOptions) => {
            const value = readDocumentMove(move);
            const revision = readRevision(options);
            await guard(WRITE_PERMISSIONS.document);
            return deliver<{ revision: string }>(
              await dataAdapter().moveDocument(context, readId(id), value, revision)
            );
          },
        }),
        todos: Object.freeze({
          create: async (input: PluginTodoInput) => {
            const value = readFields<PluginTodoInput>(
              input,
              { title: MAX_TITLE, dueAt: "nullable-time" },
              ["title"]
            );
            await guard("todos:write");
            return deliver<PluginTodo>(await writeTodo({ action: "create", input: value }));
          },
          update: async (id: string, patch: PluginTodoPatch, options: PluginWriteOptions) => {
            const value = readFields<PluginTodoPatch>(patch, {
              title: MAX_TITLE,
              dueAt: "nullable-time",
            });
            const expectedRevision = readRevision(options);
            await guard("todos:write");
            return deliver<PluginTodo>(
              await writeTodo({
                action: "update",
                id: readId(id),
                patch: value,
                expectedRevision,
              })
            );
          },
          setCompleted: async (id: string, completed: boolean, options: PluginWriteOptions) => {
            if (typeof completed !== "boolean") throw new Error("completed 无效");
            const expectedRevision = readRevision(options);
            await guard("todos:write");
            return deliver<PluginTodo>(
              await writeTodo({
                action: "complete",
                id: readId(id),
                completed,
                expectedRevision,
              })
            );
          },
          delete: async (id: string, options: PluginWriteOptions) => {
            const expectedRevision = readRevision(options);
            await guard("todos:delete");
            await writeTodo({
              action: "delete",
              id: readId(id),
              expectedRevision,
            });
            this.assertActive(entry, activation);
          },
          query: async (query?: PluginTodoQuery) => {
            const picked = pickQuery<PluginTodoQuery>(query, {
              source: "string",
              view: "string",
              completed: "boolean",
              keyword: "string",
              start: "string",
              end: "string",
              cursor: "string",
            });
            if (picked.source !== undefined && !["all", "todo", "document"].includes(picked.source))
              throw new Error("查询参数 source 无效");
            if (picked.view !== undefined && !["tasks", "occurrences"].includes(picked.view))
              throw new Error("查询参数 view 无效");
            if (picked.view === "occurrences" && (!picked.start || !picked.end))
              throw new Error("周期实例查询须同时提供 start/end");
            const limit = readLimit(query?.limit, 100);
            await guard("todos:read");
            return deliver<PluginPage<PluginTodo>>(
              await dataAdapter().todos(context, { ...picked, limit })
            );
          },
        }),
        calendar: Object.freeze({
          create: async (input: PluginCalendarInput) => {
            const value = readFields<PluginCalendarInput>(
              input,
              { title: MAX_TITLE, start: 64, end: 64, allDay: "boolean", calendarId: 32 },
              ["title", "start", "end", "allDay"]
            );
            await guard("calendar:write");
            return deliver<PluginCalendarEvent>(
              await dataAdapter().writeCalendar(context, { action: "create", input: value })
            );
          },
          update: async (id: string, patch: PluginCalendarPatch, options: PluginWriteOptions) => {
            const value = readFields<PluginCalendarPatch>(patch, {
              title: MAX_TITLE,
              start: 64,
              end: 64,
              allDay: "boolean",
              calendarId: 32,
            });
            const expectedRevision = readRevision(options);
            await guard("calendar:write");
            return deliver<PluginCalendarEvent>(
              await dataAdapter().writeCalendar(context, {
                action: "update",
                id: readId(id),
                patch: value,
                expectedRevision,
              })
            );
          },
          delete: async (id: string, options: PluginWriteOptions) => {
            const expectedRevision = readRevision(options);
            await guard("calendar:delete");
            await dataAdapter().writeCalendar(context, {
              action: "delete",
              id: readId(id),
              expectedRevision,
            });
            this.assertActive(entry, activation);
          },
          query: async (query: PluginCalendarQuery) => {
            const picked = pickQuery<PluginCalendarQuery>(query, {
              start: "string",
              end: "string",
              cursor: "string",
            });
            if (!picked.start || !picked.end) throw new Error("日程查询需要 start 与 end");
            const limit = readLimit(query?.limit, 100);
            await guard("calendar:read");
            return deliver<PluginPage<PluginCalendarEvent>>(
              await dataAdapter().calendar(context, {
                start: picked.start,
                end: picked.end,
                ...(picked.cursor === undefined ? {} : { cursor: picked.cursor }),
                limit,
              })
            );
          },
        }),
      }),
      notifications: Object.freeze({
        send: (options: PluginNotificationOptions) => {
          this.assertActive(entry, activation);
          const value = readNotificationOptions(options);
          if (!this.options.notifications) throw new Error("当前宿主不支持通知");
          let disposed = false;
          const resource = this.options.notifications.send(context, owner, {
            ...value,
            actions: value.actions?.map(action => ({
              ...action,
              onClick: async () => {
                this.assertActive(entry, activation);
                if (disposed) throw new Error("通知已失效");
                await action.onClick();
                this.assertActive(entry, activation);
              },
            })),
          });
          return register({
            dispose: () => {
              disposed = true;
              return resource.dispose();
            },
          });
        },
      }),
      speech: Object.freeze({
        unavailableReason: () => {
          this.assertActive(entry, activation);
          if (!this.options.speech) return "当前设备不支持插件语音输入";
          return this.options.speech.unavailableReason();
        },
        start: async (options: PluginSpeechStartOptions = {}): Promise<PluginSpeechSession> => {
          this.assertActive(entry, activation);
          if (options.onPreview !== undefined && typeof options.onPreview !== "function")
            throw new Error("onPreview 必须是函数");
          const adapter = this.options.speech;
          if (!adapter) throw new Error("SPEECH_UNAVAILABLE：当前宿主不支持插件语音输入");
          await guard("speech:input");
          const onPreview = options.onPreview;
          const signal = options.signal
            ? AbortSignal.any([options.signal, activation.controller.signal])
            : activation.controller.signal;
          signal.throwIfAborted();
          const session = await adapter.start(context, {
            signal,
            onPreview: text => {
              if (!signal.aborted) onPreview?.(String(text));
            },
          });
          this.assertActive(entry, activation);
          return Object.freeze({
            result: session.result.then(text => {
              this.assertActive(entry, activation);
              return String(text);
            }),
            stop: () => session.stop(),
            cancel: () => session.cancel(),
          });
        },
      }),
      app: Object.freeze({
        pick: async (options: PluginPickOptions) => {
          const kinds = options?.kinds;
          if (!Array.isArray(kinds) || !kinds.length || kinds.some(kind => !entityKinds.has(kind)))
            throw new Error("请指定可选的内容类型");
          if (options.multiple !== undefined && typeof options.multiple !== "boolean")
            throw new Error("multiple 无效");
          const value: Required<PluginPickOptions> = {
            kinds: [...new Set<PluginEntityKind>(kinds)],
            multiple: options.multiple ?? false,
            title:
              options.title === undefined
                ? "选择要关联的内容"
                : readText(options.title, "标题", 100),
          };
          this.assertActive(entry, activation);
          if (!this.options.app) throw new Error("当前宿主不支持选择内容");
          return deliver<PluginPickedEntity[]>(await this.options.app.pick(context, owner, value));
        },
        open: async (ref: PluginEntityRef, options?: PluginOpenOptions) => {
          const value = readEntityRef(ref);
          const opening = readOpenOptions(value, options);
          this.assertActive(entry, activation);
          if (!this.options.app) throw new Error("当前宿主不支持打开内容");
          await this.options.app.open(context, value, opening);
          this.assertActive(entry, activation);
        },
        describe: async (refs: readonly PluginEntityRef[]) => {
          if (!Array.isArray(refs) || refs.length > MAX_DESCRIBE)
            throw new Error(`refs 必须是最多 ${MAX_DESCRIBE} 项的数组`);
          const values = refs.map(readEntityRef);
          this.assertActive(entry, activation);
          if (!this.options.app) throw new Error("当前宿主不支持读取内容信息");
          // 只查询已有授权，不弹窗：由插件引导用户点击后再 permissions.request
          const readable: PluginEntityKind[] = [];
          for (const kind of new Set(values.map(ref => ref.kind))) {
            const permission = PLUGIN_ENTITY_READ_PERMISSIONS[kind];
            if (
              permission &&
              declared.has(permission) &&
              (await permissionsAdapter().query(context, permission)) === "granted"
            )
              readable.push(kind);
          }
          const results = await this.options.app.describe(context, values, readable);
          this.assertActive(entry, activation);
          if (results.length !== values.length) throw new Error("宿主返回的描述数量不一致");
          return values.map((ref, index): PluginEntityDescription => {
            const result = results[index];
            if (result.status === "ok") return { ref, status: "ok", title: result.title };
            if (result.status === "missing") return { ref, status: "missing" };
            return { ref, status: "denied", permission: PLUGIN_ENTITY_READ_PERMISSIONS[ref.kind] };
          });
        },
        run: async (action: PluginAppAction, options: unknown) => {
          const request = readRunRequest(action, options);
          this.assertActive(entry, activation);
          if (!this.options.app) throw new Error("当前宿主不支持该动作");
          const result = await this.options.app.run(context, owner, request);
          this.assertActive(entry, activation);
          if (!CREATING_ACTIONS.has(request.action)) return undefined as never;
          return (result ? readEntityRef(result) : null) as never;
        },
      }),
      entities: Object.freeze({
        registerKind: (definition: PluginOwnEntityKind) => {
          this.assertActive(entry, activation);
          const value = readEntityKind(definition);
          if (entityKindDefinitions.has(value.kind)) throw new Error(`类型 ${value.kind} 已声明`);
          const hosted = this.options.entities?.registerKind?.(context, value);
          entityKindDefinitions.set(value.kind, value);
          return register({
            dispose: () => {
              if (entityKindDefinitions.get(value.kind) === value)
                entityKindDefinitions.delete(value.kind);
              return hosted?.dispose();
            },
          });
        },
        create: async (input: PluginOwnEntityInput) => {
          const value = readEntityCreate(input);
          return deliver<PluginOwnEntity>(
            await entitiesAdapter().create(context, value.input, value.indexes)
          );
        },
        get: async (id: string) =>
          deliver<PluginOwnEntity | null>(await entitiesAdapter().get(context, readId(id))),
        find: async (kind: string, key: string) =>
          deliver<PluginOwnEntity | null>(
            await entitiesAdapter().find(
              context,
              readText(kind, "类型", 128),
              readText(key, "key", 200)
            )
          ),
        query: async (query?: PluginOwnEntityQuery) => {
          const filter = readEntityFilter(query);
          const cursor = query?.cursor;
          if (cursor !== undefined) readText(cursor, "cursor", MAX_QUERY_CURSOR);
          const limit = query?.limit ?? 50;
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
            throw new Error("limit 必须是 1–200 的整数");
          const orderBy = readOrderBy(
            query?.orderBy,
            filter.kind === undefined ? {} : kindIndexes(filter.kind),
            ENTITY_SORT_FIELDS
          );
          return deliver<PluginPage<PluginOwnEntity>>(
            await entitiesAdapter().query(context, {
              ...filter,
              orderBy: orderBy.length ? orderBy : DEFAULT_ENTITY_ORDER,
              ...(cursor === undefined ? {} : { cursor }),
              limit,
            })
          );
        },
        count: async (filter?: PluginOwnEntityFilter) =>
          deliver<number>(await entitiesAdapter().count(context, readEntityFilter(filter))),
        backlinks: async (id: string) => {
          const sources = await entitiesAdapter().backlinks(context, readId(id));
          this.assertActive(entry, activation);
          // 只给已获准读取的类型，不弹窗；其余只计数
          const states = new Map<ContentOwnerEntity, boolean>();
          for (const entity of new Set(sources.flatMap(source => source.entity ?? []))) {
            const permission = ENTITY_PERMISSIONS[entity];
            states.set(
              entity,
              declared.has(permission) &&
                (await permissionsAdapter().query(context, permission)) === "granted"
            );
          }
          const items: PluginOwnEntityBacklink[] = [];
          for (const source of sources)
            if (source.entity && states.get(source.entity))
              items.push({
                ref: { kind: source.entity, id: source.id },
                title: source.title,
                snippets: source.snippets,
              });
          return deliver<{ items: PluginOwnEntityBacklink[]; omitted: number }>({
            items,
            omitted: sources.length - items.length,
          });
        },
        delete: async (id: string, options: PluginWriteOptions) => {
          await entitiesAdapter().delete(context, readId(id), readRevision(options));
          this.assertActive(entry, activation);
        },
        update: async (id: string, patch: PluginOwnEntityPatch, options: PluginWriteOptions) =>
          deliver<PluginOwnEntity>(
            await entitiesAdapter().update(
              context,
              readId(id),
              readEntityPatch(patch),
              readRevision(options),
              allKindIndexes()
            )
          ),
      }),
      links: Object.freeze({
        add: async (from: string, to: PluginEntityRef, options?: PluginLinkOptions) => {
          const { readable, ...link } = await readLinkAdd(from, to, options);
          return deliver<PluginLink>(
            await linksAdapter().add(context, { id: crypto.randomUUID(), ...link }, readable)
          );
        },
        list: async (from: string, options?: { role?: string }) => {
          const role = options?.role;
          if (role !== undefined && role !== "") assertLocalId(role);
          return deliver<PluginLink[]>(await linksAdapter().list(context, readId(from), role));
        },
        remove: async (id: string) => {
          await linksAdapter().remove(context, readId(id));
          this.assertActive(entry, activation);
        },
        reorder: async (from: string, ids: readonly string[]) => {
          await linksAdapter().reorder(context, readId(from), readReorderIds(ids));
          this.assertActive(entry, activation);
        },
      }),
      records: Object.freeze({
        registerCollection: (definition: PluginRecordCollection) => {
          this.assertActive(entry, activation);
          const value = readRecordCollection(definition);
          if (recordCollections.has(value.name)) throw new Error(`集合 ${value.name} 已声明`);
          recordCollections.set(value.name, value);
          return register({
            dispose: () => {
              if (recordCollections.get(value.name) === value) recordCollections.delete(value.name);
            },
          });
        },
        insert: async (name: string, data: PluginRecordData) => {
          const collection = collectionOf(name);
          return deliver<PluginRecord>(
            await recordsAdapter().insert(
              context,
              collection.name,
              { id: crypto.randomUUID(), data: readRecordData(data) },
              collection.indexes
            )
          );
        },
        get: async (name: string, id: string) =>
          deliver<PluginRecord | null>(
            await recordsAdapter().get(context, collectionOf(name).name, readId(id))
          ),
        query: async (name: string, query?: PluginRecordQuery) => {
          const collection = collectionOf(name);
          if (query !== undefined && (!query || typeof query !== "object"))
            throw new Error("参数无效");
          const cursor = query?.cursor;
          if (cursor !== undefined) readText(cursor, "cursor", MAX_QUERY_CURSOR);
          const limit = query?.limit ?? 50;
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
            throw new Error("limit 必须是 1–200 的整数");
          const orderBy = readOrderBy(query?.orderBy, collection.indexes, RECORD_SORT_FIELDS);
          return deliver<PluginPage<PluginRecord>>(
            await recordsAdapter().query(context, collection.name, {
              where: readWhere(query?.where, collection.indexes),
              orderBy: orderBy.length ? orderBy : DEFAULT_RECORD_ORDER,
              ...(cursor === undefined ? {} : { cursor }),
              limit,
            })
          );
        },
        count: async (name: string, filter?: PluginRecordFilter) => {
          const collection = collectionOf(name);
          if (filter !== undefined && (!filter || typeof filter !== "object"))
            throw new Error("参数无效");
          return deliver<number>(
            await recordsAdapter().count(
              context,
              collection.name,
              readWhere(filter?.where, collection.indexes)
            )
          );
        },
        update: async (
          name: string,
          id: string,
          data: PluginRecordData,
          options: PluginWriteOptions
        ) => {
          const collection = collectionOf(name);
          return deliver<PluginRecord>(
            await recordsAdapter().update(
              context,
              collection.name,
              readId(id),
              readRecordData(data),
              readRevision(options),
              collection.indexes
            )
          );
        },
        delete: async (name: string, id: string, options: PluginWriteOptions) => {
          await recordsAdapter().delete(
            context,
            collectionOf(name).name,
            readId(id),
            readRevision(options)
          );
          this.assertActive(entry, activation);
        },
      }),
      transaction: async <T>(run: (tx: PluginTransaction) => T | Promise<T>): Promise<T> => {
        this.assertActive(entry, activation);
        if (typeof run !== "function") throw new Error("事务回调必须是函数");
        if (!this.options.transaction) throw new Error("当前宿主不支持原子提交");
        const adapter = this.options.transaction;
        const ops: PluginTransactionOp[] = [];
        const pending = new Set<Promise<unknown>>();
        const failures: unknown[] = [];
        let open = true;
        const push = (op: PluginTransactionOp) => {
          if (!open) throw new Error("事务已结束，不能再写入");
          if (ops.length >= MAX_TRANSACTION_OPS)
            throw new Error(`一个事务最多 ${MAX_TRANSACTION_OPS} 条写入`);
          ops.push(op);
        };
        // 每条写入都登记；没有 await 的写入失败同样让整个事务不提交
        const write = <R>(task: () => R | Promise<R>): Promise<R> => {
          const promise = (async () => {
            if (!open) throw new Error("事务已结束，不能再写入");
            this.assertActive(entry, activation);
            return task();
          })();
          pending.add(promise.catch(error => void failures.push(error)));
          return promise;
        };
        const settle = async () => {
          for (let size = -1; size !== pending.size;) {
            size = pending.size;
            await Promise.all(pending);
          }
          open = false;
        };
        const tx: PluginTransaction = Object.freeze({
          entities: Object.freeze({
            create: (input: PluginOwnEntityInput) =>
              write(async () => {
                const value = readEntityCreate(input);
                const id = await adapter.reserveEntityId(context);
                push({ op: "entity.create", id, ...value });
                return { id };
              }),
            update: (id: string, patch: PluginOwnEntityPatch, options?: unknown) =>
              write(() => {
                const revision = readOptionalRevision(options);
                push({
                  op: "entity.update",
                  id: readId(id),
                  patch: readEntityPatch(patch),
                  ...(revision === undefined ? {} : { expectedRevision: revision }),
                  indexes: allKindIndexes(),
                });
              }),
            delete: (id: string, options?: unknown) =>
              write(() => {
                const revision = readOptionalRevision(options);
                push({
                  op: "entity.delete",
                  id: readId(id),
                  ...(revision === undefined ? {} : { expectedRevision: revision }),
                });
              }),
          }),
          records: Object.freeze({
            insert: (name: string, data: PluginRecordData) =>
              write(() => {
                const collection = collectionOf(name);
                const id = crypto.randomUUID();
                push({
                  op: "record.insert",
                  collection: collection.name,
                  id,
                  data: readRecordData(data),
                  indexes: collection.indexes,
                });
                return { id };
              }),
            update: (name: string, id: string, data: PluginRecordData, options?: unknown) =>
              write(() => {
                const collection = collectionOf(name);
                const revision = readOptionalRevision(options);
                push({
                  op: "record.update",
                  collection: collection.name,
                  id: readId(id),
                  data: readRecordData(data),
                  ...(revision === undefined ? {} : { expectedRevision: revision }),
                  indexes: collection.indexes,
                });
              }),
            delete: (name: string, id: string, options?: unknown) =>
              write(() => {
                const revision = readOptionalRevision(options);
                push({
                  op: "record.delete",
                  collection: collectionOf(name).name,
                  id: readId(id),
                  ...(revision === undefined ? {} : { expectedRevision: revision }),
                });
              }),
          }),
          links: Object.freeze({
            add: (from: string, to: PluginEntityRef, options?: PluginLinkOptions) =>
              write(async () => {
                const link = await readLinkAdd(from, to, options);
                push({ op: "link.add", id: crypto.randomUUID(), ...link });
              }),
            remove: (id: string) => write(() => push({ op: "link.remove", id: readId(id) })),
            reorder: (from: string, ids: readonly string[]) =>
              write(() =>
                push({ op: "link.reorder", from: readId(from), ids: readReorderIds(ids) })
              ),
          }),
        });
        let result: T;
        try {
          result = await run(tx);
        } finally {
          await settle();
        }
        if (failures.length) throw failures[0];
        if (ops.length) await adapter.commit(context, ops);
        this.assertActive(entry, activation);
        return result;
      },
      events: Object.freeze({
        on: (
          types: PluginEventType | readonly PluginEventType[],
          listener: (event: PluginDomainEvent) => void
        ) => {
          this.assertActive(entry, activation);
          const wanted = new Set(typeof types === "string" ? [types] : types);
          if (!wanted.size || [...wanted].some(type => !isPluginEventType(type)))
            throw new Error("未知的事件类型");
          if (typeof listener !== "function") throw new Error("事件监听必须是函数");
          assertDeclared(
            [...wanted].flatMap(type => {
              const permission = PLUGIN_EVENT_PERMISSIONS[type];
              return permission ? [permission] : [];
            })
          );
          if (!this.options.events) throw new Error("当前宿主不支持业务事件");
          // 权限查询是异步的，串行投递保持事件顺序
          let delivery = Promise.resolve();
          const subscription = this.options.events.subscribe(context, event => {
            if (!wanted.has(event.type) || activation.controller.signal.aborted) return;
            const permission = PLUGIN_EVENT_PERMISSIONS[event.type];
            const snapshot = copyJson(event) as unknown as PluginDomainEvent;
            delivery = delivery
              .then(async () => {
                if (
                  permission &&
                  (await permissionsAdapter().query(context, permission)) !== "granted"
                )
                  return;
                this.assertActive(entry, activation);
                listener(snapshot);
              })
              .catch(error => {
                if (!activation.controller.signal.aborted) console.error("插件事件处理失败", error);
              });
          });
          return register(subscription);
        },
      }),
      content: Object.freeze({
        read: async (ref: PluginContentRef, options?: { format?: "markdown" | "nodes" }) => {
          if (typeof ref !== "string" || !ref) throw new Error("正文引用无效");
          const format = options?.format ?? "markdown";
          if (format !== "markdown" && format !== "nodes") throw new Error("正文格式无效");
          const result = await dataAdapter().readContent(context, ref, format);
          this.assertActive(entry, activation);
          if (result && format === "nodes")
            result.snapshot = { ...result.snapshot, schemaVersion: EDITOR_NODE_SCHEMA_VERSION };
          // 本插件实体的正文直接放行
          if (result?.own) return deliver<PluginContentSnapshot>(result.snapshot);
          if (!result?.owners.length) return null;
          const candidates = contentPermissions(result.owners, "read");
          const usable = candidates.filter(permission => declared.has(permission));
          if (!usable.length) throw new PluginPermissionError(candidates[0], "undeclared");
          const adapter = permissionsAdapter();
          const states = await Promise.all(usable.map(item => adapter.query(context, item)));
          const granted = usable.find((_, index) => states[index] === "granted");
          await guard(granted ?? usable[0]);
          return deliver<PluginContentSnapshot>(result.snapshot);
        },
        edit: async (
          ref: PluginContentRef,
          edit: PluginContentEdit,
          options: PluginWriteOptions
        ) => {
          if (typeof ref !== "string" || !ref) throw new Error("正文引用无效");
          const value = readContentEdit(edit);
          const revision = readRevision(options);
          const { owners, own } = await dataAdapter().contentOwners(context, ref);
          this.assertActive(entry, activation);
          if (own)
            return deliver<{ revision: string }>(
              await dataAdapter().editContent(context, ref, value, revision)
            );
          if (!owners.length) throw new Error("正文不存在");
          const candidates = contentPermissions(owners, "write");
          const usable = candidates.filter(permission => declared.has(permission));
          if (!usable.length) throw new PluginPermissionError(candidates[0], "undeclared");
          const adapter = permissionsAdapter();
          const states = await Promise.all(usable.map(item => adapter.query(context, item)));
          await guard(usable.find((_, index) => states[index] === "granted") ?? usable[0]);
          return deliver<{ revision: string }>(
            await dataAdapter().editContent(context, ref, value, revision)
          );
        },
      }),
      sidebar: Object.freeze({
        registerGroup: (definition: PluginSidebarGroupDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("侧边栏分组标题不能为空");
          if (!this.options.sidebar) throw new Error("当前宿主不支持侧边栏");
          const handle = this.options.sidebar.registerGroup(
            context,
            Object.freeze({ ...definition })
          );
          return Object.freeze({ id: handle.id, dispose: register(handle).dispose });
        },
        registerItem: (definition: PluginSidebarItemDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("侧边栏条目标题不能为空");
          const page = pages.get(definition.page);
          if (!page?.active()) throw new Error("侧边栏条目必须关联本次启用注册的有效页面");
          if (!this.options.sidebar) throw new Error("当前宿主不支持侧边栏");
          const resource = this.options.sidebar.registerItem(
            context,
            Object.freeze({
              ...definition,
              params: Object.freeze(normalizePageParams(definition.params ?? {})),
            }),
            page.id
          );
          const owned = registerAs("sidebar", resource);
          let state: PluginSidebarItemState = Object.freeze({
            badge: 0,
            children: Object.freeze([]),
            action: null,
          });
          let removed = false;
          // 插件停用或条目移除后，宿主不再调用插件的回调
          const wrap =
            <A extends unknown[]>(run: (...args: A) => unknown) =>
            (...args: A) => {
              this.assertActive(entry, activation);
              if (removed) throw new Error("侧边栏条目已移除");
              return run(...args);
            };
          const handle: PluginSidebarItemHandle = {
            update: (patch: PluginSidebarItemUpdate) => {
              this.assertActive(entry, activation);
              if (removed) throw new Error("侧边栏条目已移除");
              state = snapshotSidebarUpdate(state, patch, {
                wrap,
                dragType: type => sidebarDragType(scope.pluginId, type),
              });
              resource.update(state);
            },
            dispose: () => {
              removed = true;
              return owned.dispose();
            },
          };
          return Object.freeze(handle);
        },
        dragType: (type: string) => sidebarDragType(scope.pluginId, type),
      }),
      views: Object.freeze({
        registerEntityPanel: (definition: PluginEntityPanelDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (typeof definition.component !== "function")
            throw new Error("详情区块组件必须是 React 组件");
          const kinds = definition.kinds;
          if (!Array.isArray(kinds) || !kinds.length) throw new Error("详情区块至少要有一类对象");
          for (const kind of kinds)
            if (!PLUGIN_ENTITY_PANEL_KINDS.includes(kind))
              throw new Error(`不支持的详情区块对象：${String(kind)}`);
          if (!this.options.views) throw new Error("当前宿主不支持详情区块");
          return registerAs(
            "entity-panel",
            this.options.views.registerEntityPanel(
              context,
              Object.freeze({
                id: definition.id,
                kinds: Object.freeze([...new Set(kinds)]),
                component: definition.component,
              })
            )
          );
        },
      }),
      actions: Object.freeze({
        register: <K extends PluginActionTargetKind>(input: PluginActionDefinition<K>) => {
          this.assertActive(entry, activation);
          const definition = input as unknown as PluginActionDefinition;
          assertLocalId(definition.id);
          if (typeof definition.title !== "string" || !definition.title.trim())
            throw new Error("对象动作标题不能为空");
          if (definition.icon !== undefined && typeof definition.icon !== "function")
            throw new Error("对象动作图标必须是 React 组件");
          if (typeof definition.run !== "function") throw new Error("对象动作必须提供 run");
          const targets = definition.targets;
          if (!Array.isArray(targets) || !targets.length)
            throw new Error("对象动作至少要有一类目标");
          for (const target of targets)
            if (!PLUGIN_ACTION_TARGET_KINDS.includes(target))
              throw new Error(`不支持的对象动作目标：${String(target)}`);
          if (!this.options.actions) throw new Error("当前宿主不支持对象动作");
          const run = definition.run;
          let removed = false;
          const owned = registerAs(
            "action",
            this.options.actions.register(
              context,
              Object.freeze({
                id: definition.id,
                title: definition.title,
                ...(definition.icon ? { icon: definition.icon } : {}),
                targets: Object.freeze([...new Set(targets)]),
                run: (target: Parameters<PluginActionDefinition["run"]>[0]) => {
                  this.assertActive(entry, activation);
                  if (removed) throw new Error("对象动作已注销");
                  return run(snapshotActionTarget(target));
                },
              })
            )
          );
          return {
            dispose: () => {
              removed = true;
              return owned.dispose();
            },
          };
        },
      }),
      home: Object.freeze({
        registerPanel: (definition: PluginHomePanelDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (typeof definition.title !== "string" || !definition.title.trim())
            throw new Error("首页面板标题不能为空");
          if (typeof definition.component !== "function")
            throw new Error("首页面板组件必须是 React 组件");
          const size = definition.size ?? "wide";
          if (size !== "compact" && size !== "wide") throw new Error("首页面板宽度无效");
          const action = definition.action ?? null;
          if (
            action !== null &&
            (typeof action !== "object" ||
              typeof action.title !== "string" ||
              !action.title.trim() ||
              typeof action.run !== "function")
          )
            throw new Error("首页面板入口需要标题和 run 函数");
          if (!this.options.home) throw new Error("当前宿主不支持首页面板");
          return registerAs(
            "home",
            this.options.home.registerPanel(
              context,
              Object.freeze({
                id: definition.id,
                title: definition.title,
                component: definition.component,
                size,
                action: action && Object.freeze({ title: action.title, run: action.run }),
              })
            )
          );
        },
      }),
      pages: Object.freeze({
        register: (definition: PluginPageDefinition) => {
          this.assertActive(entry, activation);
          assertLocalId(definition.id);
          if (!definition.title.trim()) throw new Error("页面标题不能为空");
          if (
            definition.match !== undefined &&
            definition.match !== "single" &&
            definition.match !== "params"
          ) {
            throw new Error("不支持的页面匹配方式");
          }
          if (!this.options.pages) throw new Error("当前宿主不支持页面");
          const handle = this.options.pages.register(context, Object.freeze({ ...definition }));
          let disposed = false;
          const navigation = new Set<Disposable>();
          const resource = registerAs("page", {
            dispose: async () => {
              disposed = true;
              const results = await Promise.allSettled([
                ...[...navigation].map(entry => Promise.resolve().then(() => entry.dispose())),
                Promise.resolve().then(() => handle.dispose()),
              ]);
              const errors = results.filter(
                (result): result is PromiseRejectedResult => result.status === "rejected"
              );
              if (errors.length)
                throw new AggregateError(
                  errors.map(result => result.reason),
                  "页面及入口回收失败"
                );
            },
          });
          const exposed: PluginPageHandle = Object.freeze({
            id: handle.id,
            open: async (params = {}) => {
              this.assertActive(entry, activation);
              if (disposed) throw new Error("页面已注销");
              await handle.open(normalizePageParams(params));
            },
            dispose: resource.dispose,
          });
          pages.set(exposed, { id: definition.id, active: () => !disposed, navigation });
          return exposed;
        },
      }),
    };
    return Object.freeze(context);
  }

  private changed() {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error("插件状态订阅失败", error);
      }
    }
  }

  private async cleanup(entry: Entry): Promise<unknown[]> {
    const activation = entry.activation;
    if (!activation) return [];
    activation.controller.abort();
    const errors: unknown[] = [];
    const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
    try {
      await waitForLifecycle(() => activation.instance?.deactivate?.(), deadline, "停用");
    } catch (error) {
      errors.push(error);
    }
    for (const resource of activation.resources.splice(0).reverse()) {
      try {
        await waitForLifecycle(() => resource.dispose(), deadline, "资源清理");
      } catch (error) {
        errors.push(error);
      }
    }
    entry.activation = undefined;
    if (errors.length) this.restartRequired.add(entry.metadata.id);
    return errors;
  }

  private assertActive(entry: Entry, activation: Activation): void {
    if (
      this.closed ||
      entry.activation !== activation ||
      this.entries.get(entry.metadata.id) !== entry
    ) {
      throw new Error("插件实例已失效");
    }
    assertStorageActive({
      pluginId: entry.metadata.id,
      workspaceId: this.options.workspaceId,
      signal: activation.controller.signal,
    });
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("插件宿主已关闭");
  }

  private entry(id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`插件未注册：${id}`);
    return entry;
  }

  private enqueue(entry: Entry, operation: () => Promise<void>): Promise<void> {
    const result = entry.pending.then(operation, operation);
    entry.pending = result.catch(() => undefined);
    return result;
  }
}
