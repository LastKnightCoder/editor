/**
 * 关联与打开已有内容：插件页面（如自建画布）引用用户的卡片、日记、待办等，并在点击时打开。
 * 引用可以序列化后存入插件自己的数据；id 与 context.data 中同类实体的 id 一致。
 */

export type PluginEntityKind =
  "card" | "article" | "document" | "diary" | "whiteboard" | "todo" | "event";

export const PLUGIN_ENTITY_KINDS: readonly PluginEntityKind[] = [
  "card",
  "article",
  "document",
  "diary",
  "whiteboard",
  "todo",
  "event",
];

export interface PluginEntityRef {
  kind: PluginEntityKind;
  id: string;
}

/** 用户选中的一项：标题是选择时的快照，之后的改名需要读取权限才能取到 */
export interface PluginPickedEntity {
  ref: PluginEntityRef;
  title: string;
}

export interface PluginPickOptions {
  /** 可选类型，顺序即弹窗中的分组顺序 */
  kinds: readonly PluginEntityKind[];
  /** 默认 false：点选一项即确认 */
  multiple?: boolean;
  /** 弹窗标题，默认「选择要关联的内容」 */
  title?: string;
}

export interface PluginApp {
  /**
   * 打开 Tau 的搜索选择弹窗，返回用户选中的内容；用户取消时返回空数组。
   * 用户亲手挑选即视为同意插件引用这些内容，不需要读取权限。只能在用户操作（点击、按键）后调用。
   */
  pick(options: PluginPickOptions): Promise<PluginPickedEntity[]>;
  /** 打开对应的页面：卡片详情、日记当天、待办详情、日程详情等。只能在用户操作后调用；内容已删除时抛错。 */
  open(ref: PluginEntityRef): Promise<void>;
}
