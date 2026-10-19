import { useEffect, useState } from "react";
import { create } from "zustand";

type Pending<TOptions, TResult> = TOptions & { resolve: (result: TResult) => void };

export interface HostedRequestState<TOptions, TResult> {
  pending: Pending<TOptions, TResult> | null;
  /** 已挂载的渲染点（按挂载顺序），队首负责渲染 */
  hosts: symbol[];
  /** 发起请求；已有未决的请求时按取消结算，只保留最新一次 */
  request: (options: TOptions & { signal?: AbortSignal }) => Promise<TResult>;
  settle: (result: TResult) => void;
  attachHost: (host: symbol) => void;
  detachHost: (host: symbol) => void;
}

/**
 * 默认提示服务的对话框状态（确认 / 输入各一份）：Promise 驱动，渲染点挂在编辑器内。
 * `cancelled` 是取消时的结算值；没有渲染点时直接按取消结算，不在界面外静默执行操作。
 */
export function createHostedRequestStore<TOptions extends object, TResult>(cancelled: TResult) {
  return create<HostedRequestState<TOptions, TResult>>((set, get) => ({
    pending: null,
    hosts: [],
    request: options =>
      new Promise<TResult>(resolve => {
        if (get().hosts.length === 0 || options.signal?.aborted) {
          resolve(cancelled);
          return;
        }
        get().pending?.resolve(cancelled);
        const abort = () => {
          if (get().pending === pending) get().settle(cancelled);
        };
        const pending = {
          ...options,
          resolve: (result: TResult) => {
            options.signal?.removeEventListener("abort", abort);
            resolve(result);
          },
        };
        options.signal?.addEventListener("abort", abort, { once: true });
        set({ pending });
      }),
    settle: result => {
      const { pending } = get();
      if (!pending) return;
      set({ pending: null });
      pending.resolve(result);
    },
    attachHost: host => set(state => ({ hosts: [...state.hosts, host] })),
    detachHost: host => {
      const hosts = get().hosts.filter(item => item !== host);
      set({ hosts });
      // 最后一个编辑器卸载时还有未决的请求：按取消结算，调用方的 await 不会永远挂起
      if (hosts.length === 0) get().settle(cancelled);
    },
  }));
}

export type HostedRequestStore<TOptions extends object, TResult> = ReturnType<
  typeof createHostedRequestStore<TOptions, TResult>
>;

/**
 * 渲染点登记：同页多个编辑器各挂一个，按挂载顺序只让队首渲染，队首卸载后下一个接手，
 * 避免叠出两层对话框。返回本渲染点当前是否该渲染。
 */
export function useHostedRequestLeader<TOptions extends object, TResult>(
  store: HostedRequestStore<TOptions, TResult>
): boolean {
  const [token] = useState(() => Symbol("hosted-request"));
  const isLeader = store(state => state.hosts[0] === token);

  useEffect(() => {
    const { attachHost, detachHost } = store.getState();
    attachHost(token);
    return () => detachHost(token);
  }, [store, token]);

  return isLeader;
}
