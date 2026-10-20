/**
 * 插件实体：插件自己创建、各带一份正文的内容（如周记、看板卡片）。正文与卡片正文一样实时保存、
 * 随云同步；读写自己的实体与正文不需要业务数据权限。
 */
import type { Disposable } from "./contract";
import type { PluginContentRef, PluginPage, PluginWriteOptions } from "./data";
import type { JsonValue } from "./json";
import type { PluginPageParams } from "./pages";

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
  /** 用户在 Tau 中打开这项内容时进入的插件页面；params 只能读取实体字段，不访问其他状态 */
  open: { page: string; params?: (entity: PluginOwnEntity) => PluginPageParams };
  /** 是否可在正文中用 @ 引用，默认 false */
  mentionable?: boolean;
}

export interface PluginOwnEntityInput {
  kind: string;
  key: string;
  title?: string;
  meta?: PluginOwnEntityMeta;
}

export interface PluginOwnEntityPatch {
  title?: string;
  meta?: PluginOwnEntityMeta;
}

export interface PluginOwnEntityQuery {
  kind?: string;
  cursor?: string;
  /** 默认 50，最多 200 */
  limit?: number;
}

export interface PluginOwnEntities {
  /** 声明一种内容类型；create 只接受已声明的类型 */
  registerKind(definition: PluginOwnEntityKind): Disposable;
  /** 新建一项，正文为空。同一类型下 key 已存在时抛出 PluginConflictError */
  create(input: PluginOwnEntityInput): Promise<PluginOwnEntity>;
  get(id: string): Promise<PluginOwnEntity | null>;
  find(kind: string, key: string): Promise<PluginOwnEntity | null>;
  /** 按创建时间倒序分页 */
  query(query?: PluginOwnEntityQuery): Promise<PluginPage<PluginOwnEntity>>;
  /** 修改标题或 meta；revision 不是最新时抛出 PluginConflictError */
  update(
    id: string,
    patch: PluginOwnEntityPatch,
    options: PluginWriteOptions
  ): Promise<PluginOwnEntity>;
}
