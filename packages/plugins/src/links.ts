/**
 * 插件关联：从本插件的内容（context.entities）指向任意可引用内容的有序关联，如「问题 → 探究材料」。
 * 关联随笔记库保存；目标被删除时关联保留，由 describe / EntityRef 显示为已删除。
 */
import type { PluginEntityRef } from "./app";
import type { JsonValue } from "./json";

export type PluginLinkData = Record<string, JsonValue>;

export interface PluginLink {
  /** 宿主生成的不透明 ID */
  id: string;
  /** 来源：本插件内容的 ID */
  from: string;
  to: PluginEntityRef;
  /** 插件定义的关联角色，如 material、answer；缺省为空字符串 */
  role: string;
  /** 少量附加数据（不超过 4 KB），如对话里的消息位置 */
  data: PluginLinkData;
  createdAt: number;
}

export interface PluginLinkOptions {
  role?: string;
  data?: PluginLinkData;
}

export interface PluginLinks {
  /**
   * 添加一条关联，排在同一角色的末尾；同一来源、目标与角色已关联时返回已有的那条，不修改 data。
   * 目标须是插件能看到的内容：用户选择过或请 Tau 新建的、本插件自己的内容，或已获准读取的类型；
   * 否则抛错，且不透露目标是否存在。
   */
  add(from: string, to: PluginEntityRef, options?: PluginLinkOptions): Promise<PluginLink>;
  /** 按角色与顺序列出来源的关联；给出 role 时只列这一角色 */
  list(from: string, options?: { role?: string }): Promise<PluginLink[]>;
  /** 删除一条关联；已不存在时不报错 */
  remove(id: string): Promise<void>;
  /** 重排同一来源、同一角色的全部关联：ids 须恰好是这一角色当前的全部关联 */
  reorder(from: string, ids: readonly string[]): Promise<void>;
}
