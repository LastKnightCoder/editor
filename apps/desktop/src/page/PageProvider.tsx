/**
 * PageProvider —— 导航运行时枢纽（从移动端 RouterProvider 移植的最小核心）。
 *
 * 职责：持有栈机状态、暴露 navigator 命令对象（push/replace/back/forward/popToTop）、
 * Esc=后退（LIFO 退场，根页无操作；编辑上下文中让位）、match 去重（single/params 命中即激活不新建）。
 *
 * 栈操作以 action 走 reducer、由 React 串行归约：同一 tick 内连续导航不会互相覆盖
 * （去重判定也在 reducer 内基于 prev 做，不依赖渲染期的 stateRef 桥）。
 *
 * 刻意未做（接线点见 03 指南）：window.history 同步（桌面不需要，栈机即唯一真相源）、
 * 浮层导航（dialog/drawer 不经 definePage，见 DECISIONS D-002）、canLeave 守卫拦截、
 * 结果通道 pushForResult、实例级 store。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import * as sm from "./core/stackMachine";
import { getPageMeta } from "./core/pageMeta";
import { sanitizeParams } from "./core/paramsSchema";
import { isEditableTarget } from "./dom";

export interface Navigator {
  push(key: string, params?: Record<string, unknown>): void;
  replace(key: string, params?: Record<string, unknown>): void;
  back(): void;
  forward(): void;
  popToTop(): void;
  canBack(): boolean;
  canForward(): boolean;
  current(): sm.PageEntry | undefined;
}

/** 注册浮层退场回调，返回注销函数（LIFO：Esc 先关最上层浮层，见 D-003）。 */
export type RegisterOverlayDismiss = (dismiss: () => void) => () => void;

interface PageContextValue {
  navigator: Navigator;
  state: sm.StackMachineState;
  registerOverlayDismiss: RegisterOverlayDismiss;
}

const PageContext = createContext<PageContextValue | null>(null);

type StackAction =
  | { type: "push" | "replace"; key: string; params?: Record<string, unknown> }
  | { type: "back" }
  | { type: "forward" }
  | { type: "popToTop" };

function sanitizeFor(
  key: string,
  params?: Record<string, unknown>
): Record<string, unknown> | null {
  const meta = getPageMeta(key);
  if (!meta) {
    if (import.meta.env.DEV) console.warn(`[page] 未注册的 page：${key}`);
    return null;
  }
  return sanitizeParams(meta.fields, params ?? {});
}

function reducer(prev: sm.StackMachineState, action: StackAction): sm.StackMachineState {
  switch (action.type) {
    case "push":
    case "replace": {
      const clean = sanitizeFor(action.key, action.params);
      if (clean === null) return prev;
      const meta = getPageMeta(action.key)!;
      // match 去重：single 命中同 key；params 命中同 getId —— 激活已有实例而非新建
      if (action.type === "push" && meta.match !== "multi") {
        const hit = sm.activateExisting(
          prev,
          entry => {
            if (entry.key !== action.key) return false;
            if (meta.match === "single") return true;
            return (meta.getId?.(entry.params) ?? "") === (meta.getId?.(clean) ?? "");
          },
          clean
        );
        if (hit) return hit; // 栈顶同参命中时 activateExisting 返回 prev 原引用，React 自动 bail out
      }
      return action.type === "push"
        ? sm.push(prev, action.key, clean)
        : sm.replace(prev, action.key, clean);
    }
    case "back":
      return sm.back(prev) ?? prev;
    case "forward":
      return sm.forward(prev) ?? prev;
    case "popToTop":
      return sm.popToTop(prev);
  }
}

export function PageProvider({
  initialKey,
  initialParams,
  children,
}: {
  initialKey: string;
  initialParams?: Record<string, unknown>;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const clean = sanitizeFor(initialKey, initialParams);
    return clean === null ? sm.initialState() : sm.push(sm.initialState(), initialKey, clean);
  });

  // 查询类命令（canBack/current 等）读最新栈的桥：dispatch 稳定，navigator 随之稳定
  const stateRef = useRef(state);
  stateRef.current = state;

  // 浮层退场注册表（D-003）：Map 保插入序，Esc 取最后注册者（LIFO 最上层）
  const overlayDismissers = useRef(new Map<number, () => void>());
  const nextOverlayId = useRef(1);
  const registerOverlayDismiss = useMemo<RegisterOverlayDismiss>(() => {
    return dismiss => {
      const id = nextOverlayId.current++;
      overlayDismissers.current.set(id, dismiss);
      return () => {
        overlayDismissers.current.delete(id);
      };
    };
  }, []);

  const navigator = useMemo<Navigator>(
    () => ({
      push: (key, params) => dispatch({ type: "push", key, params }),
      replace: (key, params) => dispatch({ type: "replace", key, params }),
      back: () => dispatch({ type: "back" }),
      forward: () => dispatch({ type: "forward" }),
      popToTop: () => dispatch({ type: "popToTop" }),
      canBack: () => sm.canBack(stateRef.current),
      canForward: () => sm.canForward(stateRef.current),
      current: () => sm.current(stateRef.current),
    }),
    []
  );

  // Esc 仲裁（03 指南 §5）：先关最上层浮层（浮层输入框里的 Esc 同义，优先于
  // 「取消编辑」），无浮层再让位编辑上下文，最后后退。根页无操作。
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const dismissers = [...overlayDismissers.current.values()];
      if (dismissers.length > 0) {
        e.preventDefault();
        dismissers[dismissers.length - 1]();
        return;
      }
      if (isEditableTarget(e.target)) return; // 输入上下文里 Esc 的语义是取消编辑
      navigator.back();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  const value = useMemo<PageContextValue>(
    () => ({ navigator, state, registerOverlayDismiss }),
    [navigator, state, registerOverlayDismiss]
  );
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

/**
 * 浮层接入 Esc 仲裁：active 期间把 dismiss 注册为当前最上层退场回调
 * （Esc 关浮层而非页面后退；多层浮层 LIFO）。dismiss 闭包经 ref 保鲜。
 */
export function useOverlayDismiss(dismiss: () => void, active = true) {
  const { registerOverlayDismiss } = usePage();
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    if (!active) return;
    return registerOverlayDismiss(() => dismissRef.current());
  }, [active, registerOverlayDismiss]);
}

export function usePage(): PageContextValue {
  const ctx = useContext(PageContext);
  if (!ctx) throw new Error("usePage 必须在 <PageProvider> 内使用");
  return ctx;
}
