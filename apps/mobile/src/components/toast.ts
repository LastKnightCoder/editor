// 移动端提示的调用形态：toast({ type, text })、toast.success("…")。显示统一由 @tau/ui 的 toast
// 承担（ToastViewport 挂深色外观的 ToastHost），插件与公共包里调用的 @tau/ui toast 走同一条通道。

import { toast as uiToast } from "@tau/ui";

export type ToastType = "success" | "info" | "warning" | "error";

/** toast 内的动作按钮（如「撤销」）：点击后执行回调并立即关闭该条 */
export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  /** 同 id 的提示只保留一条：新提示原位替换并重新计时 */
  id?: string;
  type: ToastType;
  text: string;
  duration?: number;
  action?: ToastAction;
};

const DEFAULT_DURATION = 3000;

type TypedToastInput = {
  text: string;
  id?: string;
  duration?: number;
};

type TypedToastFunction = (content: string | TypedToastInput, duration?: number) => () => void;

export type ToastAPI = {
  (options: ToastOptions): () => void;
  success: TypedToastFunction;
  info: TypedToastFunction;
  warning: TypedToastFunction;
  error: TypedToastFunction;
};

function pushToast(options: ToastOptions): () => void {
  const id = uiToast.show(options.type, options.text, {
    key: options.id?.trim() || undefined,
    duration: options.duration ?? DEFAULT_DURATION,
    action: options.action,
  });
  return () => uiToast.dismiss(id);
}

function createTypedToast(type: ToastType): TypedToastFunction {
  return (content, duration) =>
    typeof content === "string"
      ? pushToast({ type, text: content, duration })
      : pushToast({ type, ...content, duration: content.duration ?? duration });
}

export const toast: ToastAPI = Object.assign(pushToast, {
  success: createTypedToast("success"),
  info: createTypedToast("info"),
  warning: createTypedToast("warning"),
  error: createTypedToast("error"),
});

export const TOAST_DEFAULT_DURATION = DEFAULT_DURATION;

export type ToastMessage = {
  id: number;
  key?: string;
  type: ToastType | "loading";
  text: string;
  duration: number;
  action?: ToastAction;
};

/** 当前显示的提示（按出现顺序）；clearAll 清空，供测试与少量状态读取 */
export const toastQueue = {
  list: (): ToastMessage[] =>
    uiToast.items().map(item => ({
      id: item.id,
      key: item.key,
      type: item.type,
      text: item.message,
      duration: item.duration,
      action: item.action,
    })),
  clearAll: () => uiToast.dismiss(),
};
