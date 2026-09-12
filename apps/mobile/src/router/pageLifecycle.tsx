// 生命周期分发：PageHost 把每个页面实例的 phase（active/paused）与转场事件
// 写入 PageInstanceContext，usePageLifecycle 在页面内消费并派发分层事件。

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { RouteEntry } from "./core/stackMachine";
import type { Navigator } from "./navigatorTypes";
import { registerEntryDestroyHandler } from "./existenceEvents";

export type PagePhase = "active" | "paused";
export type PageTransitionEventType = "enter" | "entered" | "leave" | "left";

export type PageInstanceContextValue = {
  entry: RouteEntry;
  params: Record<string, unknown>;
  navigator: Navigator;
  phase: PagePhase;
  /** 转场事件流水（seq 递增触发 effect），type 为 null 表示无待处理事件 */
  transition: { seq: number; type: PageTransitionEventType | null };
};

const PageInstanceContext = createContext<PageInstanceContextValue | null>(null);

export function PageInstanceProvider({
  value,
  children,
}: {
  value: PageInstanceContextValue;
  children: ReactNode;
}) {
  return <PageInstanceContext.Provider value={value}>{children}</PageInstanceContext.Provider>;
}

export function usePageInstanceContext(): PageInstanceContextValue {
  const value = useContext(PageInstanceContext);
  if (!value) {
    throw new Error("页面 hooks 必须在 PageHost 渲染的页面组件内使用");
  }
  return value;
}

/** 宽容版：任意宿主可用，树外（rootContent/AppDock 等）返回 null。通用浮层组件接入返回仲裁用 */
export function useOptionalPageInstanceContext(): PageInstanceContextValue | null {
  return useContext(PageInstanceContext);
}

export type PageLifecycleHandlers = {
  /**
   * 实例创建时触发一次（组件首次挂载）。
   * 注意：页面被压入第三层（Activity hidden）只卸载 effect，不影响本事件；
   * LRU 逐出后恢复会重新挂载组件，onInit 会再次触发（数据由 query 缓存恢复）。
   */
  onInit?: () => void;
  /** 实例离开栈（被 pop）时由 Host 分发——真正的存在级销毁，与 Activity hidden 无关 */
  onDestroy?: () => void;
  /** 转场动画开始前（进入方向） */
  onEnter?: () => void;
  /** 进入转场动画结束后 */
  onEntered?: () => void;
  /** 离开转场动画开始前（被 push 覆盖或返回出栈） */
  onLeave?: () => void;
  /** 离开转场动画结束后 */
  onLeft?: () => void;
  /** 从上层页面返回重新可见 */
  onResume?: () => void;
  /** 被上层页面覆盖 */
  onPause?: () => void;
};

export function usePageLifecycle(handlers: PageLifecycleHandlers): void {
  const ctx = usePageInstanceContext();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // 存在级：onInit 挂载时一次（initRef 防 Activity hidden 卸载后重挂重复触发）；
  // onDestroy 注册进 existenceEvents，由 Host 在 entry 离开栈时分发（不受 hidden 影响）
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      handlersRef.current.onInit?.();
    }
    registerEntryDestroyHandler(ctx.entry.id, () => handlersRef.current.onDestroy?.());
  }, [ctx.entry.id]);

  // 恢复级
  const prevPhaseRef = useRef<PagePhase>(ctx.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = ctx.phase;
    if (prev === ctx.phase) return;
    if (ctx.phase === "paused") handlersRef.current.onPause?.();
    if (ctx.phase === "active") handlersRef.current.onResume?.();
  }, [ctx.phase]);

  // 显示级（对齐转场动画）
  const prevSeqRef = useRef(ctx.transition.seq);
  useEffect(() => {
    if (ctx.transition.seq === prevSeqRef.current) return;
    prevSeqRef.current = ctx.transition.seq;
    const type = ctx.transition.type;
    if (!type) return;
    if (type === "enter") handlersRef.current.onEnter?.();
    else if (type === "entered") handlersRef.current.onEntered?.();
    else if (type === "leave") handlersRef.current.onLeave?.();
    else if (type === "left") handlersRef.current.onLeft?.();
  }, [ctx.transition.seq, ctx.transition.type]);
}

/**
 * 返回消费器：handler 返回 true 表示页面自行处理了本次返回
 * （如页内浮层先关闭），router 不再弹栈。同一页面可叠加多个，
 * 仲裁按注册逆序（后挂载的浮层先消费）。
 */
export function useBackHandler(handler: () => boolean | Promise<boolean>): void {
  const ctx = usePageInstanceContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const entryId = ctx.entry.id;

  useEffect(() => {
    return ctx.navigator.registerBackHandler(entryId, () => handlerRef.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);
}

/** 动态离开守卫：返回 false 阻止本实例被返回/弹出（未保存提示等） */
export function usePageGuard(guard: () => boolean | Promise<boolean>): void {
  const ctx = usePageInstanceContext();
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const entryId = ctx.entry.id;

  useEffect(() => {
    ctx.navigator.registerGuard(entryId, () => guardRef.current());
    return () => {
      ctx.navigator.registerGuard(entryId, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);
}
