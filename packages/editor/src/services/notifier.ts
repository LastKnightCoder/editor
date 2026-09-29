import { toast } from "@tau/ui";
import useConfirmStore from "../stores/useConfirmStore";

/**
 * 编辑器内的轻提示与确认（取代 antd message / modal）。
 * 默认实现：提示走 `@tau/ui` 的 toast（宿主须挂 `<ToastHost />`），确认走 `@tau/ui` 的 ConfirmDialog
 * （编辑器自带挂载点）。有自己提示体系的宿主（mobile）注册自己的实现。
 */
export interface EditorNotifier {
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
  /** 常驻的进行中提示；返回的句柄用来把同一条提示落定为成功 / 失败 */
  loading(message: string): EditorLoadingHandle;
  /** 危险操作的确认；用户确认返回 true */
  confirm(options: EditorConfirmOptions): Promise<boolean>;
}

export interface EditorLoadingHandle {
  success(message: string): void;
  error(message: string): void;
}

export interface EditorConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** 菜单构建函数等只需要结果反馈的地方收这个窄接口 */
export type EditorFeedback = Pick<EditorNotifier, "success" | "error" | "warning">;

export const defaultEditorNotifier: EditorNotifier = {
  success: message => void toast.success(message),
  error: message => void toast.error(message),
  warning: message => void toast.warning(message),
  loading: message => {
    const id = toast.loading(message, { duration: 0 });
    return {
      success: next => toast.resolve(id, next),
      error: next => {
        toast.dismiss(id);
        toast.error(next);
      },
    };
  },
  confirm: options => useConfirmStore.getState().request(options),
};
