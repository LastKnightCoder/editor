import type { Disposable } from "./contract";

export type PluginNotificationMode = "auto" | "in-app" | "system";

export interface PluginNotificationAction {
  label: string;
  primary?: boolean;
  resolvedText?: string;
  onClick(): void | Promise<void>;
}

export interface PluginNotificationOptions {
  title: string;
  body?: string;
  /** 默认 auto：插件所在窗口聚焦时应用内展示，否则进入独立通知窗口。 */
  mode?: PluginNotificationMode;
  tone?: "neutral" | "ok" | "danger";
  /** 常驻到用户处理或关闭，默认 false。 */
  sticky?: boolean;
  /** 最多两个按钮，最多一个主按钮；回调在插件所在窗口执行。 */
  actions?: readonly PluginNotificationAction[];
}

export interface PluginNotifications {
  /** 发送通知，dispose 撤销这一条；停用、激活失败或切库时自动撤销。 */
  send(options: PluginNotificationOptions): Disposable;
}

/** 只复制公开字段，避免插件对象或回调进入跨进程载荷。 */
export function readNotificationOptions(
  input: PluginNotificationOptions
): PluginNotificationOptions {
  const text = (value: unknown, label: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new Error(`${label}无效（最多 ${max} 字符）`);
    return value;
  };
  if (!input || typeof input !== "object") throw new Error("通知参数无效");
  const mode = input.mode ?? "auto";
  if (!["auto", "in-app", "system"].includes(mode)) throw new Error("通知模式无效");
  const tone = input.tone ?? "neutral";
  if (!["neutral", "ok", "danger"].includes(tone)) throw new Error("通知语义无效");
  if (input.sticky !== undefined && typeof input.sticky !== "boolean")
    throw new Error("通知 sticky 无效");
  if (input.actions !== undefined && (!Array.isArray(input.actions) || input.actions.length > 2))
    throw new Error("通知最多支持两个按钮");
  const actions =
    input.actions &&
    Array.from(input.actions, action => {
      if (!action || typeof action.onClick !== "function") throw new Error("通知按钮回调无效");
      if (action.primary !== undefined && typeof action.primary !== "boolean")
        throw new Error("通知主按钮标记无效");
      return {
        label: text(action.label, "通知按钮", 100),
        primary: action.primary,
        resolvedText:
          action.resolvedText === undefined
            ? undefined
            : text(action.resolvedText, "通知结果", 500),
        onClick: action.onClick,
      };
    });
  if (actions && actions.filter(action => action.primary).length > 1)
    throw new Error("通知最多支持一个主按钮");
  return {
    title: text(input.title, "通知标题", 200),
    body: input.body === undefined ? undefined : text(input.body, "通知正文", 5000),
    mode,
    tone,
    sticky: input.sticky,
    actions,
  };
}
