/**
 * SurfaceProvider —— 导航运行时枢纽（从移动端 RouterProvider 移植的最小核心）。
 *
 * 职责：持有栈机状态、暴露 navigator 命令对象（push/replace/back/forward/popToTop）、
 * Esc=后退（LIFO 退场，根页无操作；编辑上下文中让位）、match 去重（single/params 命中即激活不新建）。
 *
 * 栈操作以 action 走 reducer、由 React 串行归约：同一 tick 内连续导航不会互相覆盖
 * （去重判定也在 reducer 内基于 prev 做，不依赖渲染期的 stateRef 桥）。
 *
 * 刻意未做（接线点见 03 指南）：window.history 同步（桌面不需要，栈机即唯一真相源）、
 * dialog/drawer OverlayHost、canLeave 守卫拦截、结果通道 pushForResult、实例级 store。
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
import { getSurfaceMeta } from "./core/surfaceMeta";
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
  current(): sm.SurfaceEntry | undefined;
}

interface SurfaceContextValue {
  navigator: Navigator;
  state: sm.StackMachineState;
}

const SurfaceContext = createContext<SurfaceContextValue | null>(null);

type StackAction =
  | { type: "push" | "replace"; key: string; params?: Record<string, unknown> }
  | { type: "back" }
  | { type: "forward" }
  | { type: "popToTop" };

function sanitizeFor(
  key: string,
  params?: Record<string, unknown>
): Record<string, unknown> | null {
  const meta = getSurfaceMeta(key);
  if (!meta) {
    if (import.meta.env.DEV) console.warn(`[surface] 未注册的 surface：${key}`);
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
      const meta = getSurfaceMeta(action.key)!;
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

export function SurfaceProvider({
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

  // Esc = 后退（LIFO 退场；根页无操作）。浮层（dialog/drawer/palette）接入后改为先关浮层。
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      if (isEditableTarget(e.target)) return; // 输入上下文里 Esc 的语义是取消编辑
      navigator.back();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  const value = useMemo<SurfaceContextValue>(() => ({ navigator, state }), [navigator, state]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useSurface(): SurfaceContextValue {
  const ctx = useContext(SurfaceContext);
  if (!ctx) throw new Error("useSurface 必须在 <SurfaceProvider> 内使用");
  return ctx;
}
