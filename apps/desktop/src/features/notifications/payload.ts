import type { NotificationOptions } from "@tau/ui";
import type { SystemNotificationPayload } from "@tau/platform";
import { NOTIFICATION_ICONS, type NotificationIconKey } from "./icons";

/**
 * 系统通知 payload → 应用内 NotificationOptions：可序列化字段直通，icon 字符串键查
 * 注册表取组件（未登记键回落到 tone 默认图标），按钮的 onClick 不可跨 IPC，由调用方
 * 注入执行桥（系统通知窗口传 platform.notification.action，应用内直投传本地回调）。
 */
export function toNotifyOptions(
  payload: SystemNotificationPayload,
  onAction: (index: number) => Promise<void>
): NotificationOptions {
  const { icon, actions, ...rest } = payload;
  return {
    ...rest,
    icon:
      icon && icon in NOTIFICATION_ICONS
        ? NOTIFICATION_ICONS[icon as NotificationIconKey]
        : undefined,
    actions: actions?.map((action, index) => ({
      label: action.label,
      primary: action.primary,
      resolvedText: action.resolvedText,
      onClick: () => onAction(index),
    })),
  };
}
