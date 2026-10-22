import type { Disposable } from "./contract";
import type { PluginIcon } from "./icons";

/**
 * 对象动作可以挂在哪类对象上：document 为项目文档；material 为划线、PDF 标注与剪藏；
 * chat-message 为对话里的一条消息。
 */
export type PluginActionTargetKind = "card" | "article" | "document" | "material" | "chat-message";

type PluginActionEntityKind = "card" | "article" | "document" | "material";

/** 卡片、文章、项目文档、材料：与 PluginEntityRef 相同 */
export type PluginActionEntityTarget = {
  [K in PluginActionEntityKind]: { kind: K; id: string };
}[PluginActionEntityKind];

/**
 * 对话里的一条消息。text 是消息正文（用户亲手交给插件，不需要权限）；
 * session 之后与 pick 选中的一样，可以显示与关联；messageIds 是这条消息在会话里的记录 ID，
 * 一条 AI 回答可能由多条记录组成。
 */
export interface PluginChatMessageTarget {
  kind: "chat-message";
  session: { kind: "chat-session"; id: string };
  messageIds: readonly string[];
  role: "user" | "assistant";
  text: string;
}

export type PluginActionTarget = PluginActionEntityTarget | PluginChatMessageTarget;

/** 某几类目标对应的对象：run 的参数随 targets 收窄 */
export type PluginActionTargetOf<K extends PluginActionTargetKind> = Extract<
  PluginActionTarget,
  { kind: K }
>;

export interface PluginActionDefinition<K extends PluginActionTargetKind = PluginActionTargetKind> {
  id: string;
  /** 菜单里显示的名称 */
  title: string;
  /** 缺省使用插件图标 */
  icon?: PluginIcon;
  targets: readonly K[];
  /**
   * 用户在对象的「⋯」菜单里点击时调用。这个对象（对话消息为所在会话）之后与 pick 选中的一样，
   * 不需要读取权限就能读标题、显示与关联；读正文仍按权限。
   */
  run(target: PluginActionTargetOf<K>): unknown;
}

export interface PluginActions {
  /** 只在主窗口出现，独立编辑窗口不列插件动作 */
  register<K extends PluginActionTargetKind>(definition: PluginActionDefinition<K>): Disposable;
}

export const PLUGIN_ACTION_TARGET_KINDS: readonly PluginActionTargetKind[] = Object.freeze([
  "card",
  "article",
  "document",
  "material",
  "chat-message",
]);

/** 交给插件前复制并冻结，插件拿不到宿主对象上的其他字段 */
export function snapshotActionTarget(target: PluginActionTarget): PluginActionTarget {
  if (target.kind === "chat-message")
    return Object.freeze({
      kind: target.kind,
      session: Object.freeze({ kind: "chat-session" as const, id: String(target.session.id) }),
      messageIds: Object.freeze(target.messageIds.map(String)),
      role: target.role === "assistant" ? "assistant" : "user",
      text: String(target.text),
    });
  return Object.freeze({ kind: target.kind, id: String(target.id) });
}
