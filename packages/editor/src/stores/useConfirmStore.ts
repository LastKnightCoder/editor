import { create } from "zustand";
import type { EditorConfirmOptions } from "../services/notifier";

interface PendingConfirm extends EditorConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  /** 已挂载的 ConfirmHost（按挂载顺序），队首负责渲染 */
  hosts: symbol[];
  /** 打开确认框；已有未决的确认时按取消结算，只保留最新一次 */
  request: (options: EditorConfirmOptions) => Promise<boolean>;
  settle: (confirmed: boolean) => void;
  attachHost: (host: symbol) => void;
  detachHost: (host: symbol) => void;
}

/**
 * 默认提示服务的确认框状态。确认框由编辑器内的 `ConfirmHost` 渲染（`@tau/ui` 的 ConfirmDialog），
 * 同一时刻最多一个确认，所以全局一份即可。
 */
const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,
  hosts: [],
  request: options =>
    new Promise<boolean>(resolve => {
      // 没有编辑器挂着（调用方已卸载）：没有地方显示确认框，按取消处理，不在界面外静默执行危险操作
      if (get().hosts.length === 0) {
        resolve(false);
        return;
      }
      get().pending?.resolve(false);
      set({ pending: { ...options, resolve } });
    }),
  settle: confirmed => {
    const { pending } = get();
    if (!pending) return;
    set({ pending: null });
    pending.resolve(confirmed);
  },
  attachHost: host => set(state => ({ hosts: [...state.hosts, host] })),
  detachHost: host => {
    const hosts = get().hosts.filter(item => item !== host);
    set({ hosts });
    // 最后一个编辑器卸载时还有未决的确认：按取消结算，调用方的 await 不会永远挂起
    if (hosts.length === 0) get().settle(false);
  },
}));

export default useConfirmStore;
