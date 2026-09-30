import { toast } from "@tau/ui";
import useConfirmStore from "../stores/useConfirmStore";
import usePromptStore from "../stores/usePromptStore";

/**
 * 编辑器内的轻提示与确认（取代 antd message / modal）。
 * 默认实现：提示走 `@tau/ui` 的 toast（宿主须挂 `<ToastHost />`），确认与输入走 `@tau/ui` 的对话框
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
  /** 单行文本输入（如媒体的网络地址）；提交返回去掉首尾空白的值，取消返回 null */
  prompt(options: EditorPromptOptions): Promise<string | null>;
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

export interface EditorPromptOptions {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  /** 虚拟键盘类型（同 HTML inputMode）：url 让手机弹出网址键盘 */
  inputMode?: "text" | "url";
  /**
   * 提交前校验（入参已去首尾空白，空值不会进来）：返回错误文案则输入框保持打开并就地提示。
   * 须是纯判断——输入框可能多次提交，副作用放在 prompt resolve 之后。
   */
  validate?: (value: string) => string | undefined;
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
  prompt: options => usePromptStore.getState().request(options),
};
