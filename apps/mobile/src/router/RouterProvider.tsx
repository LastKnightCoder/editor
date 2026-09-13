// L3 运行时枢纽：持有 screen/overlay 双栈状态，构建 navigator 命令对象，
// 同步 history（push/pop/popstate 恢复），实现结果通道、离开守卫、根页双击退出。
//
// history 同步契约：增长/替换动作直接 setState + pushState/replaceState；
// 缩短栈的动作（pop/popTo/popToTop）由 history.back()/go() 驱动 popstate 恢复，
// 保证浏览器历史与内部栈始终一致（系统返回键可用）。

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPageMeta } from "./core/pageMeta";
import { sanitizeParams } from "./core/paramsSchema";
import {
  createEmptyStack,
  createStack,
  getTopEntry,
  pushEntry,
  removeEntryById,
  replaceTop,
  type RouteEntry,
  type StackSnapshot,
} from "./core/stackMachine";
import {
  pushHistoryState,
  readHistoryState,
  replaceHistoryState,
  restoreStack,
  toHistoryState,
} from "./core/historyAdapter";
import { getPageDefinition } from "./registry";
import { notifyEntriesRemoved } from "./existenceEvents";
import type {
  BackSource,
  Navigator,
  PageToast,
  PendingSettle,
  RouterState,
} from "./navigatorTypes";

const DOUBLE_BACK_EXIT_MS = 2000;

function isIOSRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent ?? "";
  const isIOSDevice = /iPhone|iPad|iPod/i.test(userAgent);
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

async function requestAppBackground(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("request_background");
    return;
  } catch {
    // 非 Tauri 环境继续降级
  }
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  } catch {
    // ignore
  }
}

function createEntryId(key: string): string {
  return `${key}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type PendingResult = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  callerEntryId: string;
};

type HistoryWriteMode = "push" | "replace" | "skip";

type PreloadableDataEntry = {
  key: (params: Record<string, unknown>) => readonly unknown[];
  load: (params: Record<string, unknown>, ctx: { signal: AbortSignal }) => Promise<unknown>;
  enabled?: (params: Record<string, unknown>) => boolean;
  staleTime?: number;
  gcTime?: number;
};

export type RouterContextValue = {
  state: RouterState;
  navigator: Navigator;
  rootKey: string;
};

const RouterContext = createContext<RouterContextValue | null>(null);

let moduleNavigator: Navigator | null = null;

export function getNavigator(): Navigator {
  if (!moduleNavigator) {
    throw new Error("[router] getNavigator() 必须在 RouterProvider 挂载后调用");
  }
  return moduleNavigator;
}

function seedRootStack(rootKey: string): StackSnapshot {
  const meta = getPageMeta(rootKey);
  if (!meta) {
    console.error(`[router] 根页 ${rootKey} 未注册，请检查页面定义文件`);
    return createEmptyStack();
  }
  const now = Date.now();
  const params = sanitizeParams(meta.paramsSchema, {}) ?? {};
  return createStack([
    {
      id: createEntryId(rootKey),
      key: rootKey,
      params,
      createdAt: now,
      lastActiveAt: now,
    },
  ]);
}

export function RouterProvider({
  children,
  rootKey = "home",
  onRootBackHint,
}: {
  children: ReactNode;
  rootKey?: string;
  /** 根页双击退出提示的展示回调，由 AppShell 注入（保持 router 零业务组件依赖） */
  onRootBackHint?: (text: string) => void;
}) {
  const [screens, setScreens] = useState<StackSnapshot>(() => seedRootStack(rootKey));
  const [overlays, setOverlays] = useState<StackSnapshot>(() => createEmptyStack());
  const [toastState, setToastState] = useState<PageToast>(null);

  const screensRef = useRef(screens);
  screensRef.current = screens;
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const lastBackTsRef = useRef(0);
  const historyModeRef = useRef<HistoryWriteMode>("skip");
  const suppressHistoryWriteRef = useRef(false);
  const pendingsRef = useRef(new Map<string, PendingResult>());
  const settlesRef = useRef(new Map<string, PendingSettle>());
  const guardsRef = useRef(new Map<string, () => boolean | Promise<boolean>>());
  const backHandlersRef = useRef(new Map<string, Array<() => boolean | Promise<boolean>>>());
  const historyBackInFlightRef = useRef(false);
  const pendingBackNavRef = useRef<{ depth: number; token: number } | null>(null);
  const nativeBounceRef = useRef<{ state: unknown; token: number } | null>(null);
  const navigationTokenRef = useRef(0);
  const routeClockRef = useRef(Date.now());

  const nextRouteTime = (): number => {
    const now = Date.now();
    routeClockRef.current = Math.max(now, routeClockRef.current + 1);
    return routeClockRef.current;
  };

  const sanitizePageParams = (
    key: string,
    params: Record<string, unknown> | undefined
  ): Record<string, unknown> | null => {
    const meta = getPageMeta(key);
    if (!meta) {
      console.warn(`[router] 未注册的页面: ${key}`);
      return null;
    }
    const sanitized = sanitizeParams(meta.paramsSchema, params ?? {});
    if (sanitized === null) {
      console.warn(`[router] 页面 ${key} 参数校验失败，已忽略导航`);
      return null;
    }
    return sanitized;
  };

  const settleResults = (): void => {
    const liveIds = new Set<string>();
    for (const entry of screensRef.current.entries) liveIds.add(entry.id);
    for (const entry of overlaysRef.current.entries) liveIds.add(entry.id);

    for (const [entryId, settle] of settlesRef.current) {
      if (liveIds.has(entryId)) continue;
      const pending = pendingsRef.current.get(entryId);
      if (pending) {
        if (settle.status === "fulfilled") pending.resolve(settle.value);
        else pending.reject(new Error(settle.reason));
      }
      pendingsRef.current.delete(entryId);
      settlesRef.current.delete(entryId);
    }
    for (const [entryId, pending] of pendingsRef.current) {
      const entryGone = !liveIds.has(entryId);
      const callerGone = !liveIds.has(pending.callerEntryId);
      if (callerGone) {
        pending.reject(new Error("caller-dismissed"));
      } else if (entryGone) {
        pending.reject(new Error("dismissed"));
      } else {
        continue;
      }
      pendingsRef.current.delete(entryId);
      settlesRef.current.delete(entryId);
    }
  };

  const applyPush = (key: string, params: Record<string, unknown> | undefined): string | null => {
    const sanitized = sanitizePageParams(key, params);
    if (sanitized === null) return null;
    const meta = getPageMeta(key)!;
    const entryId = createEntryId(key);
    const now = nextRouteTime();
    if (meta.layer === "overlay") {
      setOverlays(prev => pushEntry(prev, { key, params: sanitized, id: entryId, now }));
    } else {
      setScreens(prev => pushEntry(prev, { key, params: sanitized, id: entryId, now }));
    }
    historyModeRef.current = "push";
    return entryId;
  };

  const topEntryOf = (): RouteEntry | null => {
    const overlay = getTopEntry(overlaysRef.current);
    const screen = getTopEntry(screensRef.current);
    if (!overlay) return screen;
    if (!screen) return overlay;
    return overlay.createdAt >= screen.createdAt ? overlay : screen;
  };

  /** 问栈顶页的返回消费器链（LIFO：后注册的更上层浮层先答），任一返回 true 即消费 */
  const askBackHandler = async (entry: RouteEntry): Promise<boolean> => {
    const handlers = backHandlersRef.current.get(entry.id);
    if (!handlers) return false;
    for (let index = handlers.length - 1; index >= 0; index -= 1) {
      if (await handlers[index]()) return true;
    }
    return false;
  };

  const askLeaveGuard = async (
    entry: RouteEntry,
    source: Exclude<BackSource, "popstate">
  ): Promise<boolean> => {
    const dynamicGuard = guardsRef.current.get(entry.id);
    if (dynamicGuard && !(await dynamicGuard())) return false;
    const definition = getPageDefinition(entry.key);
    if (definition?.canLeave) {
      return await definition.canLeave({ source, entry });
    }
    return true;
  };

  /**
   * 通过 history.back/go 驱动返回，popstate 恢复栈（浏览器历史为准）。
   * 返回 true 表示已驱动回退；false 表示被 backHandler/守卫拒绝或无目标。
   * settle 在守卫通过后才落账，避免拒绝路径上残留旧结果（下次弹栈被误结算）。
   * 并发返回在两个窗口内一律丢弃（连击关闭/双击返回叠加两次 go 会多退一层、
   * 恢复出错误栈）：本函数执行期间由 inFlight flag 挡；go 发出后、popstate
   * 恢复栈之前由 pending 挡，popstate 到达即清除，watchdog 超时自愈兜底
   * 极端丢失 popstate 的场景，避免返回被永久锁死。
   */
  const historyBack = async (
    source: Exclude<BackSource, "popstate">,
    depth = 1,
    settle?: { entryId: string; settle: PendingSettle },
    options?: { bypassInterceptors?: boolean }
  ): Promise<boolean> => {
    if (historyBackInFlightRef.current || pendingBackNavRef.current !== null) {
      return false;
    }
    const target = topEntryOf();
    if (!target) return false;
    historyBackInFlightRef.current = true;
    try {
      if (!options?.bypassInterceptors) {
        const handled = await askBackHandler(target);
        if (handled) return false;
        const allowed = await askLeaveGuard(target, source);
        if (!allowed) return false;
      }
      if (settle && settle.entryId === target.id) {
        settlesRef.current.set(settle.entryId, settle.settle);
      }
      if (typeof window === "undefined" || window.history.length <= 1) {
        // 无浏览器历史可驱退（如极端 WebView）：当前 history state 即当前栈快照，
        // 无法取到上一条记录，此处仅保持守卫/settle 语义一致，不做栈变更
        return false;
      }
      const token = ++navigationTokenRef.current;
      window.history.go(-depth);
      pendingBackNavRef.current = { depth, token };
      return true;
    } finally {
      historyBackInFlightRef.current = false;
    }
  };

  const handleRootBack = (): void => {
    if (isIOSRuntime()) return;
    const now = Date.now();
    if (now - lastBackTsRef.current <= DOUBLE_BACK_EXIT_MS) {
      lastBackTsRef.current = now;
      setToastState(null);
      void requestAppBackground();
      return;
    }
    lastBackTsRef.current = now;
    setToastState({ type: "info", text: "再按一次缩小应用" });
  };

  const totalDepth = (): number =>
    screensRef.current.entries.length + overlaysRef.current.entries.length;

  const navigator = useMemo<Navigator>(
    () => ({
      push: (key, params) => {
        applyPush(key, params);
      },
      preload: async (key, params) => {
        const sanitized = sanitizePageParams(key, params);
        if (sanitized === null) return;
        const definition = getPageDefinition(key);
        const dataRecord = (definition?.data ?? {}) as Record<string, PreloadableDataEntry>;
        if (Object.keys(dataRecord).length === 0) return;
        const { getQueryClient } = await import("./query/PageQueryProvider");
        const queryClient = getQueryClient();
        await Promise.all(
          Object.entries(dataRecord).map(([dataKey, entry]) => {
            if (entry.enabled && !entry.enabled(sanitized)) {
              return Promise.resolve();
            }
            return queryClient.prefetchQuery({
              queryKey: [...entry.key(sanitized), key, dataKey],
              queryFn: ({ signal }) => entry.load(sanitized, { signal }),
              staleTime: entry.staleTime,
              gcTime: entry.gcTime,
            });
          })
        );
      },
      replace: (key, params) => {
        const sanitized = sanitizePageParams(key, params);
        if (sanitized === null) return;
        const meta = getPageMeta(key)!;
        const now = nextRouteTime();
        const spec = { key, params: sanitized, id: createEntryId(key), now };
        const current = topEntryOf();
        if (!current) return;
        // replace 是总栈上的原子替换：跨层时移除当前 route，再把目标 route
        // 放到目标层，保持总历史深度不变，避免业务方手写“先 goBack 再 push”。
        if (meta.layer === "overlay") {
          if (current === getTopEntry(overlaysRef.current)) {
            setOverlays(prev => replaceTop(prev, spec));
          } else {
            setScreens(prev => removeEntryById(prev, current.id, now));
            setOverlays(prev => pushEntry(prev, spec));
          }
        } else if (current === getTopEntry(screensRef.current)) {
          setScreens(prev => replaceTop(prev, spec));
        } else {
          setOverlays(prev => removeEntryById(prev, current.id, now));
          setScreens(prev => pushEntry(prev, spec));
        }
        historyModeRef.current = "replace";
      },
      pop: result => {
        const target = topEntryOf();
        if (!target) return;
        const settle =
          result !== undefined
            ? { entryId: target.id, settle: { status: "fulfilled" as const, value: result } }
            : undefined;
        void historyBack("code", 1, settle);
      },
      popTo: key => {
        const meta = getPageMeta(key);
        if (!meta) return;
        const screensNow = screensRef.current.entries;
        const overlaysNow = overlaysRef.current.entries;
        // 回退深度 = 当前总深度 - 目标态总深度（history 中 screen 与 overlay 交织，
        // 每条 push 记录一步），目标态按层分别计算
        let targetTotal: number;
        if (meta.layer === "overlay") {
          let overlayIndex = -1;
          for (let i = overlaysNow.length - 1; i >= 0; i -= 1) {
            if (overlaysNow[i].key === key) {
              overlayIndex = i;
              break;
            }
          }
          if (overlayIndex < 0) return;
          // 盖在目标 overlay 之上打开的 screen 也必须一并弹掉（否则浮层不可见）
          const overlayCreatedAt = overlaysNow[overlayIndex].createdAt;
          const keepScreens = screensNow.filter(
            entry => entry.createdAt <= overlayCreatedAt
          ).length;
          targetTotal = keepScreens + (overlayIndex + 1);
        } else {
          let screenIndex = -1;
          for (let i = screensNow.length - 1; i >= 0; i -= 1) {
            if (screensNow[i].key === key) {
              screenIndex = i;
              break;
            }
          }
          if (screenIndex < 0) return;
          // 弹到目标 screen 时，其上的 overlay 一并清空
          targetTotal = screenIndex + 1;
        }
        const depth = totalDepth() - targetTotal;
        if (depth > 0) {
          void historyBack("code", depth);
        }
      },
      popToTop: () => {
        const depth = Math.max(totalDepth() - 1, 0);
        if (depth <= 0) return;
        void historyBack("code", depth);
      },
      pushForResult: (key, params) => {
        return new Promise((resolve, reject) => {
          const caller = topEntryOf();
          const entryId = applyPush(key, params);
          if (entryId === null) {
            reject(new Error("invalid-page"));
            return;
          }
          pendingsRef.current.set(entryId, {
            resolve: resolve as (value: unknown) => void,
            reject,
            callerEntryId: caller?.id ?? "",
          });
        });
      },
      finish: result => {
        const target = topEntryOf();
        if (!target) return;
        // finish/cancel 是页面显式提交结果，不应被“用户返回”拦截器吞掉。
        void historyBack(
          "code",
          1,
          {
            entryId: target.id,
            settle: { status: "fulfilled", value: result },
          },
          { bypassInterceptors: true }
        );
      },
      cancel: () => {
        const target = topEntryOf();
        if (!target) return;
        void historyBack(
          "code",
          1,
          {
            entryId: target.id,
            settle: { status: "rejected", reason: "dismissed" },
          },
          { bypassInterceptors: true }
        );
      },
      goBack: async source => {
        if (source === "popstate") return false;
        if (totalDepth() > 1) {
          return await historyBack(source);
        }
        handleRootBack();
        return false;
      },
      canGoBack: () => totalDepth() > 1,
      registerGuard: (entryId, guard) => {
        if (guard === null) {
          guardsRef.current.delete(entryId);
        } else {
          guardsRef.current.set(entryId, guard);
        }
      },
      registerBackHandler: (entryId, handler) => {
        const handlers = backHandlersRef.current.get(entryId) ?? [];
        handlers.push(handler);
        backHandlersRef.current.set(entryId, handlers);
        return () => {
          const current = backHandlersRef.current.get(entryId);
          if (!current) return;
          const remaining = current.filter(item => item !== handler);
          if (remaining.length > 0) {
            backHandlersRef.current.set(entryId, remaining);
          } else {
            backHandlersRef.current.delete(entryId);
          }
        };
      },
      getScreenStack: () => screensRef.current,
      getOverlayStack: () => overlaysRef.current,
      getActiveScreen: () => getTopEntry(screensRef.current),
      getTopOverlay: () => getTopEntry(overlaysRef.current),
    }),
    // navigator 引用稳定：全部经由 refs 与 setState 闭包，不依赖渲染期变量
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // 渲染期赋值使 getNavigator() 在首次渲染后立即可用（并发渲染被丢弃时写入的
  // navigator 内容一致，无害）；卸载清理在 effect 中进行
  moduleNavigator = navigator;
  useEffect(() => {
    return () => {
      if (moduleNavigator === navigator) {
        moduleNavigator = null;
      }
    };
  }, [navigator]);

  // 初始化 history + popstate 恢复
  useEffect(() => {
    const restored = readHistoryState(window.history?.state);
    if (restored) {
      const now = Date.now();
      suppressHistoryWriteRef.current = true;
      setScreens(prev => restoreStack(restored.snapshot.screens, prev, "screen", now));
      setOverlays(prev => restoreStack(restored.snapshot.overlays, prev, "overlay", now));
    } else {
      replaceHistoryState(toHistoryState(screensRef.current, overlaysRef.current));
    }

    const onPopState = (event: PopStateEvent) => {
      const state = readHistoryState(event.state);
      const pending = pendingBackNavRef.current;
      if (pending) {
        pendingBackNavRef.current = null;
        if (state) {
          const now = Date.now();
          suppressHistoryWriteRef.current = true;
          setScreens(prev => restoreStack(state.snapshot.screens, prev, "screen", now));
          setOverlays(prev => restoreStack(state.snapshot.overlays, prev, "overlay", now));
        }
        return;
      }
      const bounce = nativeBounceRef.current;
      if (bounce) {
        nativeBounceRef.current = null;
        void historyBack("gesture");
        return;
      }
      if (!state) return;
      if (totalDepth() > 1) {
        nativeBounceRef.current = {
          state: window.history.state,
          token: ++navigationTokenRef.current,
        };
        window.history.go(1);
        return;
      }
      handleRootBack();
      const now = Date.now();
      suppressHistoryWriteRef.current = true;
      setScreens(prev => restoreStack(state.snapshot.screens, prev, "screen", now));
      setOverlays(prev => restoreStack(state.snapshot.overlays, prev, "overlay", now));
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      pendingBackNavRef.current = null;
      nativeBounceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 栈变化 → 存在级销毁分发 + 结果结算 + 按动作语义写 history
  const prevEntryIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextIds = new Set<string>();
    for (const entry of screens.entries) nextIds.add(entry.id);
    for (const entry of overlays.entries) nextIds.add(entry.id);
    const removed = [...prevEntryIdsRef.current].filter(id => !nextIds.has(id));
    prevEntryIdsRef.current = nextIds;
    if (removed.length > 0) {
      notifyEntriesRemoved(removed);
    }
    settleResults();
    if (suppressHistoryWriteRef.current) {
      suppressHistoryWriteRef.current = false;
      return;
    }
    const mode = historyModeRef.current;
    historyModeRef.current = "skip";
    if (mode === "skip") return;
    const state = toHistoryState(screens, overlays);
    if (mode === "push") {
      pushHistoryState(state);
    } else {
      replaceHistoryState(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screens, overlays]);

  // 根页双击退出提示
  useEffect(() => {
    if (!toastState) return;
    onRootBackHint?.(toastState.text);
    setToastState(null);
  }, [toastState, onRootBackHint]);

  // Android 物理返回 + 窗口关闭请求统一接入 goBack（仅 Tauri 环境注册）
  useEffect(() => {
    if (!(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      return;
    }
    let disposed = false;
    let unregisterBack: (() => void) | null = null;
    let unregisterClose: (() => void) | null = null;

    import("@tauri-apps/api/app")
      .then(({ onBackButtonPress }) =>
        onBackButtonPress(() => {
          navigator.goBack("android");
        })
      )
      .then(registered => {
        if (disposed) {
          void registered.unregister();
          return;
        }
        unregisterBack = () => void registered.unregister();
      })
      .catch(error => {
        console.error("[router] 注册物理返回失败", error);
      });

    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested(event => {
          event.preventDefault();
          navigator.goBack("android");
        })
      )
      .then(unlisten => {
        if (disposed) {
          unlisten();
          return;
        }
        unregisterClose = unlisten;
      })
      .catch(error => {
        console.error("[router] 注册关闭拦截失败", error);
      });

    return () => {
      disposed = true;
      unregisterBack?.();
      unregisterClose?.();
    };
  }, [navigator]);

  const contextValue = useMemo<RouterContextValue>(
    () => ({
      state: { screens, overlays, toast: toastState },
      navigator,
      rootKey,
    }),
    [screens, overlays, toastState, navigator, rootKey]
  );

  return <RouterContext.Provider value={contextValue}>{children}</RouterContext.Provider>;
}

export function useRouterContext(): RouterContextValue {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("useRouterContext 必须在 RouterProvider 内使用");
  }
  return value;
}
