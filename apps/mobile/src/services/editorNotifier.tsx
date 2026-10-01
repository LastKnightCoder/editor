/**
 * Mobile 的编辑器提示服务（IEditorNotifier）：提示走 mobile 自己的 toast，确认走 MobileConfirmDialog。
 * 编辑器的默认实现是 @tau/ui 的 toast 与 ConfirmDialog，mobile 没挂 @tau/ui 的 ToastHost，
 * 确认框也必须接返回手势（AGENTS.md 移动端浮层规范），所以注册自己的实现。
 */
import { create } from "zustand";
import type { EditorConfirmOptions, EditorNotifier } from "@tau/editor";
import { MobileConfirmDialog } from "../components/MobileConfirmDialog";
import { toast } from "../components/toast";

interface PendingConfirm extends EditorConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface EditorConfirmState {
  pending: PendingConfirm | null;
  request: (options: EditorConfirmOptions) => Promise<boolean>;
  settle: (confirmed: boolean) => void;
}

export const useEditorConfirmStore = create<EditorConfirmState>((set, get) => ({
  pending: null,
  request: options =>
    new Promise<boolean>(resolve => {
      // 同一时刻只保留最新一次确认，旧的按取消结算
      get().pending?.resolve(false);
      set({ pending: { ...options, resolve } });
    }),
  settle: confirmed => {
    const { pending } = get();
    if (!pending) return;
    set({ pending: null });
    pending.resolve(confirmed);
  },
}));

/** 进行中提示的常驻时长：上传等操作结束时会用同一个 id 覆盖成结果 */
const LOADING_DURATION = 60_000;
let loadingSeq = 0;

export const mobileEditorNotifier: EditorNotifier = {
  success: message => void toast.success(message),
  error: message => void toast.error(message),
  warning: message => void toast.warning(message),
  loading: message => {
    const id = `editor-loading-${++loadingSeq}`;
    toast({ id, type: "info", text: message, duration: LOADING_DURATION });
    return {
      success: next => void toast.success({ id, text: next }),
      error: next => void toast.error({ id, text: next }),
    };
  },
  confirm: options => useEditorConfirmStore.getState().request(options),
};

/** 编辑器确认框的挂载点：AppShell 挂一次 */
export function EditorConfirmHost() {
  const pending = useEditorConfirmStore(state => state.pending);
  const settle = useEditorConfirmStore(state => state.settle);
  return (
    <MobileConfirmDialog
      open={!!pending}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmText={pending?.confirmText}
      cancelText={pending?.cancelText}
      danger={pending?.danger}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );
}
