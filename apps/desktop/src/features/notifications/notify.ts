/**
 * 业务通知分流入口：应用内卡栈与系统通知窗口的统一发牌器。
 *
 * 调用方只面对 appNotify（选项与 @tau/ui notify 一致，icon 改传注册表键）：
 * - 本窗口栈里已有的 id 原位更新，不再路由（出生地不变）；
 * - 其余经主进程裁决 route：in-app 时本窗口自行入栈（沿用原 options，行为与直接
 *   notify 零差异）；system 时主进程已推系统通知窗口，本端不再渲染。
 * 按钮的 onClick 不可跨 IPC：留在此处登记，系统窗口执行时经 onRunAction 转回
 * runLocal（见 useNotificationBridge）。Web 平台 route 恒返回 "in-app"，自然退化为
 * 原应用内行为。
 */

import { notify, type NotificationOptions } from "@tau/ui";
import type { NotificationRoute, SystemNotificationPayload } from "@tau/platform";
import { platform } from "@/platform";
import { NOTIFICATION_ICONS, type NotificationIconKey } from "./icons";

export interface AppNotifyOptions extends Omit<NotificationOptions, "icon"> {
  /** 身份位图标注册键（NOTIFICATION_ICONS），跨 IPC 只传字符串 */
  icon?: NotificationIconKey;
}

export interface AppNotifyRouteOptions {
  /** 强制通知去向；不传时按来源窗口焦点自动分流。 */
  force?: NotificationRoute;
}

/** id → 各按钮的本地 onClick（同 id 重发覆盖）；条目存在兼作「仍在生效」标记 */
const localHandlers = new Map<string, Array<(() => unknown) | undefined>>();
/** 最近一次完整 options：update 时本端无内容可改，先合并再重发 */
const lastOptions = new Map<string, AppNotifyOptions>();

/** icon 注册键换成组件（未登记键回落 undefined，卡按 tone 取默认图标） */
function withIconComponent<T extends { icon?: NotificationIconKey }>(options: T) {
  const { icon, ...rest } = options;
  return {
    ...rest,
    icon:
      icon && icon in NOTIFICATION_ICONS
        ? NOTIFICATION_ICONS[icon as NotificationIconKey]
        : undefined,
  };
}

/** options → 可序列化 payload：剥离 onClick 与本地停留字段，补事件时间 */
function toPayload(options: AppNotifyOptions, id: string): SystemNotificationPayload {
  const { icon, actions, duration, ...rest } = options;
  return {
    ...rest,
    id,
    icon,
    timestamp: options.timestamp ?? Date.now(),
    actions: actions?.map(({ onClick, ...action }) => action),
  };
}

export function appNotify(options: AppNotifyOptions, routeOptions?: AppNotifyRouteOptions): string {
  const id = options.id ?? crypto.randomUUID();
  localHandlers.set(id, options.actions?.map(action => action.onClick) ?? []);
  lastOptions.set(id, { ...options, id });

  if (notify.isActive(id)) {
    notify({ ...withIconComponent(options), id });
    return id;
  }

  void platform.notification
    .route(toPayload(options, id), routeOptions)
    .then(route => {
      // 路由完成前被撤销时，也清理主进程迟到创建的系统通知。
      if (!localHandlers.has(id)) {
        if (route === "system") void platform.notification.dismiss(id);
        return;
      }
      if (route !== "in-app") return;
      notify(withIconComponent({ ...options, id }));
    })
    .catch(() => undefined); // 主进程未就绪 / 窗口关闭中：静默放弃，不惊扰调用方
  return id;
}

/** 原位改内容：本地在栈走 notify.update；否则合并上次 options 后重发同 id
 *  （主进程对已在系统窗口的 id 原位替换） */
appNotify.update = (id: string, patch: Partial<AppNotifyOptions>) => {
  const prev = lastOptions.get(id);
  if (!prev) return;
  if (notify.isActive(id)) {
    const merged = { ...prev, ...patch, id };
    lastOptions.set(id, merged);
    localHandlers.set(id, merged.actions?.map(action => action.onClick) ?? []);
    notify.update(id, withIconComponent(patch));
    return;
  }
  appNotify({ ...prev, ...patch, id });
};

/** 关闭一条（本地 + 系统窗口两侧）；不传 id 全部关闭并逐个撤销已路由的 */
appNotify.dismiss = (id?: string) => {
  notify.dismiss(id);
  if (id === undefined) {
    for (const known of [...localHandlers.keys()]) {
      localHandlers.delete(known);
      lastOptions.delete(known);
      void platform.notification.dismiss(known);
    }
    return;
  }
  localHandlers.delete(id);
  lastOptions.delete(id);
  void platform.notification.dismiss(id);
};

/** 执行本地登记的按钮回调（系统窗口经 onRunAction 转回 / 桥接层复用）；
 *  通知已撤销时 reject，由卡片展示错误 */
export function runLocal(id: string, index: number): Promise<void> {
  const handler = localHandlers.get(id)?.[index];
  if (!handler) return Promise.reject(new Error("通知已失效"));
  try {
    return Promise.resolve(handler()).then(() => undefined);
  } catch (error) {
    return Promise.reject(error);
  }
}
