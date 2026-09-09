// L2：definePage 协议——一个文件声明一个页面的全部：身份/匹配/转场/参数/数据/守卫/组件。
// 元数据注册进 core（无 React），组件注册进 React 侧注册表。

import type { ComponentType } from "react";
import {
  registerPageMeta,
  type KeepAlivePolicy,
  type MatchPolicy,
  type PageLayer,
  type PageMeta,
  type TransitionConfig,
  type TransitionPreset,
} from "./core/pageMeta";
import type { InferFields, ParamFields } from "./core/paramsSchema";
import type { RouteEntry } from "./core/stackMachine";
import { registerPageDefinition } from "./registry";

export type PageQueryContext = {
  signal: AbortSignal;
};

export type PageDataEntry<F extends ParamFields> = {
  key: (params: InferFields<F>) => readonly unknown[];
  load: (params: InferFields<F>, ctx: PageQueryContext) => Promise<unknown>;
  enabled?: (params: InferFields<F>) => boolean;
  staleTime?: number;
  gcTime?: number;
  /** 从上层页面返回时是否刷新，默认 "if-stale" */
  refetchOnResume?: "if-stale" | "always" | "never";
};

export type PageDataDefinition<F extends ParamFields> = Record<string, PageDataEntry<F>>;

export type CanLeaveContext = {
  /** 触发来源：物理返回 / 手势 / UI / 代码跳转 */
  source: "android" | "gesture" | "ui" | "code";
  entry: RouteEntry;
};

export type PageDefinitionArgs<F extends ParamFields> = {
  key: string;
  /** overlay 页面声明 layer: "overlay"（呈现为浮层） */
  layer?: PageLayer;
  /** 默认 single：全局一份；params：按 getId 身份去重；multi：每次新建 */
  match?: MatchPolicy;
  getId?: (params: InferFields<F>) => string;
  /** 默认 keep（Activity 保活）；data（非激活卸载内容，query 缓存恢复） */
  keepAlive?: KeepAlivePolicy;
  transition?: {
    preset?: TransitionPreset;
    enterMs?: number;
    exitMs?: number;
  };
  params: F;
  /** 离开守卫：返回 false 阻止离开（未保存提示等） */
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  data?: PageDataDefinition<F>;
  /** 页面私有 store 初始状态（zustand 工厂，Phase 3 接线） */
  store?: (params: InferFields<F>) => Record<string, unknown>;
  component: ComponentType;
};

// 注册后的定义类型：data 从泛型擦除为宽松形状，避免消费方类型实例化过深
export type PageDefinition = {
  meta: PageMeta;
  component: ComponentType;
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  data?: Record<
    string,
    {
      key: (params: Record<string, unknown>) => readonly unknown[];
      load: (params: Record<string, unknown>, ctx: PageQueryContext) => Promise<unknown>;
      enabled?: (params: Record<string, unknown>) => boolean;
      staleTime?: number;
      gcTime?: number;
      refetchOnResume?: "if-stale" | "always" | "never";
    }
  >;
  store?: (params: Record<string, unknown>) => Record<string, unknown>;
};

const DEFAULT_SCREEN_TRANSITION: TransitionConfig = {
  preset: "slideRight",
  enterMs: 300,
  exitMs: 250,
};
const DEFAULT_OVERLAY_TRANSITION: TransitionConfig = {
  preset: "sheetUp",
  enterMs: 300,
  exitMs: 250,
};

export function definePage<F extends ParamFields>(args: PageDefinitionArgs<F>): PageDefinition {
  const layer: PageLayer = args.layer ?? "screen";
  const baseTransition =
    layer === "overlay" ? DEFAULT_OVERLAY_TRANSITION : DEFAULT_SCREEN_TRANSITION;
  const meta: PageMeta = {
    key: args.key,
    layer,
    match: args.match ?? "single",
    getId: args.getId as ((params: Record<string, unknown>) => string) | undefined,
    keepAlive: args.keepAlive ?? "keep",
    transition: {
      preset: args.transition?.preset ?? baseTransition.preset,
      enterMs: args.transition?.enterMs ?? baseTransition.enterMs,
      exitMs: args.transition?.exitMs ?? baseTransition.exitMs,
    },
    paramsSchema: args.params,
  };

  const definition: PageDefinition = {
    meta,
    component: args.component,
    canLeave: args.canLeave,
    data: args.data as PageDefinition["data"],
    store: args.store as ((params: Record<string, unknown>) => Record<string, unknown>) | undefined,
  };

  registerPageMeta(meta);
  registerPageDefinition(definition);
  return definition;
}
