/**
 * 插件实体：插件自己创建、各带一份正文的内容（如周记、看板卡片）。正文与卡片正文一样实时保存、
 * 随云同步；读写自己的实体与正文不需要业务数据权限。
 */
import type { Disposable } from "./contract";
import type { PluginContentRef, PluginPage, PluginWriteOptions } from "./data";
import type { JsonValue } from "./json";
import type { PluginPageParams } from "./pages";
import type { PluginEntityRef } from "./app";
import type { PluginIcon } from "./icons";
import type { PluginContentInput } from "./content-input";
import type { PluginIndexes, PluginOrderBy, PluginWhere } from "./query";

export type PluginOwnEntityMeta = Record<string, JsonValue>;

export interface PluginOwnEntity {
  id: string;
  /** registerKind 声明的类型 */
  kind: string;
  /** 插件给定、同一类型内唯一的键，如周记用「2026-W43」 */
  key: string;
  title: string;
  /** 交给 context.content 或 ContentEditor 读写正文 */
  contentRef: PluginContentRef;
  meta: PluginOwnEntityMeta;
  createdAt: number;
  /** 标题、meta 与正文中较新的修改时间 */
  updatedAt: number;
  /** 标题与 meta 的版本，update 时作为 expectedRevision */
  revision: string;
}

export interface PluginOwnEntityKind {
  /** 插件内唯一的类型 ID */
  kind: string;
  /** 在 Tau 中显示的类型名，如「周记」 */
  label: string;
  /**
   * 类型图标，与侧边栏图标同一协议。宿主声明时渲染一次并随笔记库保存：插件停用、卸载宽限期内，
   * 搜索结果、正文中的引用、脉络等处仍按声明的类型名与图标显示。缺省为通用的插件图标。
   */
  icon?: PluginIcon;
  /** 用户在 Tau 中打开这项内容时进入的插件页面；params 只能读取实体字段，不访问其他状态 */
  open: { page: string; params?: (entity: PluginOwnEntity) => PluginPageParams };
  /** 是否可在正文中用 @ 引用，默认 false */
  mentionable?: boolean;
  /**
   * 可用于 query 筛选与排序的 meta 字段及类型，如 `{ status: "string", sortIndex: "number" }`。
   * 最多 16 个；写入时这些字段的值必须是声明的类型或 null。只在插件运行时生效。
   */
  indexes?: PluginIndexes;
}

export interface PluginOwnEntityInput {
  kind: string;
  key: string;
  title?: string;
  meta?: PluginOwnEntityMeta;
  /** 初始正文；省略时为空 */
  content?: PluginContentInput;
}

export interface PluginOwnEntityPatch {
  title?: string;
  meta?: PluginOwnEntityMeta;
}

/** 实体自带的排序列；其余排序字段取 registerKind 声明的 indexes */
export type PluginOwnEntitySortField = "createdAt" | "updatedAt" | "title";

export interface PluginOwnEntityFilter {
  kind?: string;
  /** 按 indexes 中的字段筛选，需同时给出 kind */
  where?: PluginWhere;
  /** 标题包含这段文字（英文字母不区分大小写） */
  titleContains?: string;
}

export interface PluginOwnEntityQuery extends PluginOwnEntityFilter {
  /**
   * 最多两项，ID 兜底保证顺序稳定；默认按创建时间倒序。字段为 createdAt、updatedAt、title，
   * 或 kind 的 indexes 中声明的字段。
   */
  orderBy?: PluginOrderBy | PluginOrderBy[];
  /** 原样传回上一页的 cursor；换了筛选或排序后不能再用 */
  cursor?: string;
  /** 默认 50，最多 200 */
  limit?: number;
}

/** 正文里引用了这项内容的一处来源 */
export interface PluginOwnEntityBacklink {
  /** 可交给 context.app.open 打开 */
  ref: PluginEntityRef;
  title: string;
  /** 引用处的上下文：前文、链接文字、后文 */
  snippets: { before: string; label: string; after: string }[];
}

export interface PluginOwnEntities {
  /** 声明一种内容类型；create 只接受已声明的类型 */
  registerKind(definition: PluginOwnEntityKind): Disposable;
  /** 新建一项，content 为初始正文（缺省为空）。同一类型下 key 已存在时抛出 PluginConflictError */
  create(input: PluginOwnEntityInput): Promise<PluginOwnEntity>;
  get(id: string): Promise<PluginOwnEntity | null>;
  find(kind: string, key: string): Promise<PluginOwnEntity | null>;
  /** 分页查询，默认按创建时间倒序 */
  query(query?: PluginOwnEntityQuery): Promise<PluginPage<PluginOwnEntity>>;
  /** 符合条件的数量 */
  count(filter?: PluginOwnEntityFilter): Promise<number>;
  /** 修改标题或 meta；revision 不是最新时抛出 PluginConflictError */
  update(
    id: string,
    patch: PluginOwnEntityPatch,
    options: PluginWriteOptions
  ): Promise<PluginOwnEntity>;
  /**
   * 删除一项及其正文；revision 不是最新时抛出 PluginConflictError。用户可在插件详情页
   * 「最近删除」中 7 天内恢复，恢复后 ID、key 与正文不变，指向它的引用重新生效。
   */
  delete(id: string, options: PluginWriteOptions): Promise<void>;
  /**
   * 哪些卡片、文章、项目文档在正文里引用了这项内容。只返回插件已获准读取的类型，不询问权限；
   * 其余来源（未获准的类型、日记、其他插件的内容）只计入 omitted。
   */
  backlinks(id: string): Promise<{ items: PluginOwnEntityBacklink[]; omitted: number }>;
}
