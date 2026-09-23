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
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import * as sm from "./core/stackMachine";
import { getPageMeta } from "./core/pageMeta";
import { sanitizeParams } from "./core/paramsSchema";

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

/** 页面级槽位注入（面包屑/状态栏）：按 page key 注册，仅栈顶页的内容被显示 */
export type RegisterPageSlot = (key: string, node: ReactNode) => () => void;

interface PageContextValue {
  navigator: Navigator;
  state: sm.StackMachineState;
  registerOverlayDismiss: RegisterOverlayDismiss;
  /** 当前栈顶页注册的面包屑（无则 undefined，Titlebar 回退到默认 label） */
  breadcrumbs: ReadonlyMap<string, ReactNode>;
  /** 当前栈顶页注册的状态栏内容（无则空壳） */
  statusBars: ReadonlyMap<string, ReactNode>;
  registerBreadcrumb: RegisterPageSlot;
  registerStatusBar: RegisterPageSlot;
}

const PageContext = createContext<PageContextValue | null>(null);

/**
 * 实例级 params（PageHost 按栈条目注入）：params 页读参数必须经 usePageParams，
 * 勿从 usePage().state 的全局栈顶取——多个 params 实例保活时，被隐藏的实例
 * 会读到栈顶（别人）的 params，引发数据串台与错误落盘。
 */
const PageParamsContext = createContext<Readonly<Record<string, unknown>>>({});

const EMPTY_NODE_MAP: ReadonlyMap<string, ReactNode> = new Map();

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

  // Esc 仲裁（03 指南 §5）：只承担浮层退场（注册表 LIFO，浮层输入框里的 Esc
  // 同义）；无浮层时无操作——后退由 Alt+←/→ 与标题栏按钮承担（2026-09-20
  // 用户裁决移除 Esc=后退：详情页误触即丢编辑上下文）。
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) return;
      const dismissers = [...overlayDismissers.current.values()];
      if (dismissers.length > 0) {
        e.preventDefault();
        dismissers[dismissers.length - 1]();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  /* 页面级槽位注册表（面包屑/状态栏）：按 page key 存 ReactNode，壳层只渲染
     栈顶 key 的条目。node 须由调用方 useMemo 稳定化（见 usePageSlot JSDoc），
     同值守卫避免无关重渲染级联 */
  const [breadcrumbs, setBreadcrumbs] = useState<ReadonlyMap<string, ReactNode>>(EMPTY_NODE_MAP);
  const [statusBars, setStatusBars] = useState<ReadonlyMap<string, ReactNode>>(EMPTY_NODE_MAP);
  const registerBreadcrumb = useRegisterSlot(setBreadcrumbs);
  const registerStatusBar = useRegisterSlot(setStatusBars);

  const value = useMemo<PageContextValue>(
    () => ({
      navigator,
      state,
      registerOverlayDismiss,
      breadcrumbs,
      statusBars,
      registerBreadcrumb,
      registerStatusBar,
    }),
    [
      navigator,
      state,
      registerOverlayDismiss,
      breadcrumbs,
      statusBars,
      registerBreadcrumb,
      registerStatusBar,
    ]
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

/**
 * 页面级槽位注入（usePageBreadcrumb / usePageStatusBar 的实现）。
 * node 必须经 useMemo 稳定化：每次渲染新建 JSX 对象会让注册 effect 无限
 * 重跑（注册 → context 变化 → 页面重渲染 → 新对象 → 再注册）。
 */
function usePageSlot(register: RegisterPageSlot, key: string, node: ReactNode) {
  useEffect(() => register(key, node), [register, key, node]);
}

/** 注入标题栏面包屑（替换默认「label」）；仅当该页是栈顶时显示 */
export function usePageBreadcrumb(key: string, node: ReactNode) {
  const { registerBreadcrumb } = usePage();
  usePageSlot(registerBreadcrumb, key, node);
}

/** 注入底部状态栏内容；仅当该页是栈顶时显示（无注册则为空壳） */
export function usePageStatusBar(key: string, node: ReactNode) {
  const { registerStatusBar } = usePage();
  usePageSlot(registerStatusBar, key, node);
}

/** 槽位注册函数构造：同 key 同 node 守卫 + 注销清理（卸载/切换页面时） */
function useRegisterSlot(
  setSlots: Dispatch<SetStateAction<ReadonlyMap<string, ReactNode>>>
): RegisterPageSlot {
  return useMemo(
    () => (key: string, node: ReactNode) => {
      setSlots(prev => {
        if (prev.get(key) === node) return prev;
        const next = new Map(prev);
        next.set(key, node);
        return next;
      });
      return () => {
        setSlots(prev => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      };
    },
    [setSlots]
  );
}

export function usePage(): PageContextValue {
  const ctx = useContext(PageContext);
  if (!ctx) throw new Error("usePage 必须在 <PageProvider> 内使用");
  return ctx;
}

/**
 * 读本实例的 params（PageHost 按栈条目注入，schema 净化后的原始类型）。
 * 泛型由调用方声明与 page 定义一致的字段形状；single 页 params 为空对象。
 */
export function usePageParams<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return useContext(PageParamsContext) as T;
}

/** PageHost 专用：把栈条目的 params 注入该实例的子树 */
export const PageParamsProvider = PageParamsContext.Provider;
