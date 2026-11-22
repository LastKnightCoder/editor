import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";
import type { JsonValue } from "./json";

export type PluginPageParams = Record<string, string | number | boolean>;

export interface PluginPageContext {
  /** 在组件 effect 中登记当前状态提供器；返回值的形状由插件决定。 */
  register(provider: () => JsonValue): Disposable;
  /**
   * 此展示位置的页面是否可见（完整页在栈顶，右栏在前台）；页面隐藏、卸载或插件停用后为 false。
   * 页面隐藏时组件的 effect 会被清理、显示时重新执行，订阅与键盘监听放在 effect 里即可随之暂停；
   * 这里供命令等 effect 之外的回调判断。
   */
  isActive(): boolean;
  /** 离开前返回 false 阻止导航；组件卸载或插件失活时自动失效。 */
  registerLeaveGuard(guard: () => boolean | Promise<boolean>): Disposable;
  /**
   * 登记一个浮层（抽屉、弹出面板）的关闭函数：用户按 Esc 时 Tau 先关最后登记的浮层，
   * 不会后退页面。只在本页显示时生效。@tau/ui 的模态 Dialog / Drawer 已自带，不必登记；
   * 插件不要自己监听 Esc。
   */
  registerDismiss(dismiss: () => void): Disposable;
}

export type PluginPagePlacement = "page" | "dock";

export interface PluginPageProps {
  readonly placement: PluginPagePlacement;
  readonly context: PluginContext;
  readonly params: Readonly<PluginPageParams>;
  readonly pageContext: PluginPageContext;
}

export interface PluginPageDefinition {
  id: string;
  title: string;
  component: ComponentType<PluginPageProps>;
  /** 允许在桌面主窗口以 dock 打开。 */
  dockable?: boolean;
  match?: "single" | "params";
  /** params 页缺省按完整参数区分实例；提供时只按该身份去重。 */
  getId?(params: Readonly<PluginPageParams>): string;
}

export interface PluginPageHandle extends Disposable {
  readonly id: string;
  open(params?: PluginPageParams, options?: { placement?: PluginPagePlacement }): Promise<void>;
}

export interface PluginPages {
  register(definition: PluginPageDefinition): PluginPageHandle;
}

export function normalizePageParams(value: unknown): PluginPageParams {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("页面参数必须是对象");
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => {
        if (
          typeof item === "string" ||
          typeof item === "boolean" ||
          (typeof item === "number" && Number.isFinite(item))
        ) {
          return [key, item];
        }
        throw new Error("页面参数只支持字符串、有限数字和布尔值");
      })
  );
}
