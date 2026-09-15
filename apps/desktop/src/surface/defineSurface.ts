/**
 * defineSurface 协议 —— 一个文件声明一个 Surface 的全部（身份/匹配/保活/参数/组件）。
 * 从移动端 definePage 移植（蓝图 §3.2），泛型只在边界：args 携带泛型 F 推导 params 类型，
 * 注册前擦除为宽松形状，避免消费方类型实例化过深。
 *
 * 用法（features/<域>/surfaces/xxx.surface.tsx）：
 *   const schema = createSurfaceSchema({ cardId: paramNumber() });
 *   export default defineSurface({
 *     key: "card-detail",
 *     match: "params",
 *     params: schema.schema,
 *     component: CardDetailView,
 *   });
 */

import type { ComponentType } from "react";
import type { InferFields, ParamFields } from "./core/paramsSchema";
import {
  registerSurfaceMeta,
  type KeepAlivePolicy,
  type MatchPolicy,
  type SurfaceKind,
  type SurfaceStatus,
} from "./core/surfaceMeta";
import { registerSurfaceDefinition } from "./registry";

export interface CanLeaveContext {
  params: Record<string, unknown>;
}

export interface SurfaceDefinition {
  key: string;
  kind: SurfaceKind;
  match: MatchPolicy;
  keepAlive: KeepAlivePolicy;
  label: string;
  status: SurfaceStatus;
  fields: ParamFields;
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  component: ComponentType;
}

export interface SurfaceDefinitionArgs<F extends ParamFields> {
  key: string;
  /** 渲染策略：page 进 PageHost；dialog/drawer 进 OverlayHost（后续接线） */
  kind?: SurfaceKind;
  /** 宿主声明流（对齐 Android launchMode）：single 全局一份 / params 按 getId 去重 / multi 每次新建 */
  match?: MatchPolicy;
  getId?: (params: InferFields<F>) => string;
  /** keep = 保活（DOM/state 保留）；data = 卸载内容靠 query 缓存恢复（后续接线） */
  keepAlive?: KeepAlivePolicy;
  /** 侧边栏/面包屑/命令面板展示名 */
  label: string;
  /** 升级状态机（迁移期专用，见蓝图 §5.1） */
  status?: SurfaceStatus;
  params: F;
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  component: ComponentType;
  /** 页面级 query 声明（按移动端 PageDataDefinition 移植，后续接线） */
  data?: unknown;
  /** 实例级 store 工厂（按移动端 PageStoreScope 移植，后续接线） */
  store?: unknown;
}

export function defineSurface<F extends ParamFields>(
  args: SurfaceDefinitionArgs<F>
): SurfaceDefinition {
  const definition: SurfaceDefinition = {
    key: args.key,
    kind: args.kind ?? "page",
    match: args.match ?? "single",
    keepAlive: args.keepAlive ?? "keep",
    label: args.label,
    status: args.status ?? "new",
    fields: args.params,
    canLeave: args.canLeave,
    component: args.component,
  };
  registerSurfaceMeta({
    key: definition.key,
    kind: definition.kind,
    match: definition.match,
    getId: args.getId as ((params: Record<string, unknown>) => string) | undefined,
    keepAlive: definition.keepAlive,
    label: definition.label,
    status: definition.status,
    fields: definition.fields,
  });
  registerSurfaceDefinition(definition);
  return definition;
}
