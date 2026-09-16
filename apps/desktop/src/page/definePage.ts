/**
 * definePage 协议 —— 一个文件声明一个 Page 的全部（身份/匹配/保活/参数/组件）。
 * 从移动端 definePage 移植（蓝图 §3.2），泛型只在边界：args 携带泛型 F 推导 params 类型，
 * 注册前擦除为宽松形状，避免消费方类型实例化过深。
 * 本协议只承载页面；dialog/drawer 等浮层不经 definePage（如需浮层导航另行裁决，D-016）。
 *
 * 用法（features/<域>/pages/xxx.page.tsx）：
 *   const schema = createPageSchema({ cardId: paramNumber() });
 *   export default definePage({
 *     key: "card-detail",
 *     match: "params",
 *     params: schema.schema,
 *     component: CardDetailView,
 *   });
 */

import type { ComponentType } from "react";
import type { InferFields, ParamFields } from "./core/paramsSchema";
import {
  registerPageMeta,
  type KeepAlivePolicy,
  type MatchPolicy,
  type PageStatus,
} from "./core/pageMeta";
import { registerPageDefinition } from "./registry";

export interface CanLeaveContext {
  params: Record<string, unknown>;
}

export interface PageDefinition {
  key: string;
  match: MatchPolicy;
  keepAlive: KeepAlivePolicy;
  label: string;
  status: PageStatus;
  fields: ParamFields;
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  component: ComponentType;
}

export interface PageDefinitionArgs<F extends ParamFields> {
  key: string;
  /** 宿主声明流（对齐 Android launchMode）：single 全局一份 / params 按 getId 去重 / multi 每次新建 */
  match?: MatchPolicy;
  getId?: (params: InferFields<F>) => string;
  /** keep = 保活（DOM/state 保留）；data = 卸载内容靠 query 缓存恢复（后续接线） */
  keepAlive?: KeepAlivePolicy;
  /** 侧边栏/面包屑/命令面板展示名 */
  label: string;
  /** 升级状态机（迁移期专用，见蓝图 §5.1） */
  status?: PageStatus;
  params: F;
  canLeave?: (ctx: CanLeaveContext) => boolean | Promise<boolean>;
  component: ComponentType;
  /** 页面级 query 声明（按移动端 PageDataDefinition 移植，后续接线） */
  data?: unknown;
  /** 实例级 store 工厂（按移动端 PageStoreScope 移植，后续接线） */
  store?: unknown;
}

export function definePage<F extends ParamFields>(args: PageDefinitionArgs<F>): PageDefinition {
  const definition: PageDefinition = {
    key: args.key,
    match: args.match ?? "single",
    keepAlive: args.keepAlive ?? "keep",
    label: args.label,
    status: args.status ?? "new",
    fields: args.params,
    canLeave: args.canLeave,
    component: args.component,
  };
  registerPageMeta({
    key: definition.key,
    match: definition.match,
    getId: args.getId as ((params: Record<string, unknown>) => string) | undefined,
    keepAlive: definition.keepAlive,
    label: definition.label,
    status: definition.status,
    fields: definition.fields,
  });
  registerPageDefinition(definition);
  return definition;
}
