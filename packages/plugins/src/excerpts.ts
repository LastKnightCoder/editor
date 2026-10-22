import type { Disposable, JsonValue } from "./contract";

/** Tau 材料的地址。对插件是不透明值：只用于传回宿主（如 materials.actions），不要依赖其字段。 */
export interface PluginMaterialRef {
  readonly kind: string;
  readonly id: number;
}

/** 摘录来源：一本书、一个网页、一篇文献 */
export interface PluginExcerptSource {
  /** 来源在本插件内的稳定标识 */
  key: string;
  title: string;
  /** 来源级 http(s) 外链，条目没有 url 时作为打开原处的兜底 */
  url?: string;
}

export interface PluginExcerptItem {
  /** 本插件内唯一且稳定；它不变，Tau 中对这条摘录的引用就一直有效 */
  externalId: string;
  quote: string;
  note?: string;
  /** 给人看的位置：「第 3 章 · 标题」「第 12 页」 */
  location?: string;
  /** 条目级 http(s) 深链，优先于来源 url */
  url?: string;
  /** 插件私有定位，宿主只存储、按键名规范化后比较，从不解读 */
  anchor?: { [key: string]: JsonValue };
  color?: string;
  /** 在来源中的创建时间（毫秒） */
  time?: number;
}

export interface PluginExcerptSyncResult {
  inserted: number;
  updated: number;
  deleted: number;
}

export interface PluginExcerptSourceSummary {
  key: string;
  title: string;
  /** 未删除的条目数 */
  count: number;
}

/** 读回的条目：写入时的字段（含缺省后的外链）加上 Tau 中的地址与删除状态 */
export interface PluginExcerptEntry {
  ref: PluginMaterialRef;
  externalId: string;
  quote: string;
  note: string;
  location: string;
  url: string | null;
  anchor: { [key: string]: JsonValue } | null;
  color: string | null;
  time: number | null;
  /** 已从来源消失（软删除）；引文保留，引用仍可解析 */
  deleted: boolean;
}

export interface PluginExcerptProviderDefinition {
  /** 提供方名称，持久化；插件停用、卸载后仍用于显示来源 */
  label: string;
  /** 从脉络、搜索、对话打开原处时调用；缺省时打开条目或来源的 url */
  open?(target: { sourceKey: string; externalId: string }): void | Promise<void>;
}

export interface PluginExcerptChange {
  upsert?: PluginExcerptItem[];
  /** 要软删除的 externalId */
  remove?: string[];
}

/** 插件作为 Tau 外部摘录的提供方；摘录归用户，插件只能软删除。写入前须在本次激活内 register。 */
export interface PluginExcerpts {
  register(definition: PluginExcerptProviderDefinition): Disposable;
  /** 快照：以全集覆盖一个来源，缺席条目软删除；items 为空即整个来源下架 */
  replace(
    source: PluginExcerptSource,
    items: PluginExcerptItem[]
  ): Promise<PluginExcerptSyncResult>;
  /** 增量：只增改或软删除指定条目 */
  patch(source: PluginExcerptSource, change: PluginExcerptChange): Promise<PluginExcerptSyncResult>;
  sources(): Promise<PluginExcerptSourceSummary[]>;
  items(sourceKey: string): Promise<PluginExcerptEntry[]>;
}

export interface PluginMaterialAction {
  id: string;
  label: string;
  run(): Promise<void>;
}

export interface PluginMaterials {
  /** 客户端对该材料当前可执行的动作（转为卡片…），不含其他插件注册的对象动作；动作随客户端增加 */
  actions(ref: PluginMaterialRef): Promise<PluginMaterialAction[]>;
}
