import type { ComponentType } from "react";
import type { Disposable, PluginContext } from "./index";

export type PluginPageParams = Record<string, string | number | boolean>;

export interface PluginPageProps {
  readonly context: PluginContext;
  readonly params: Readonly<PluginPageParams>;
}

export interface PluginPageDefinition {
  id: string;
  title: string;
  component: ComponentType<PluginPageProps>;
  match?: "single" | "params";
  /** params 页缺省按完整参数区分实例；提供时只按该身份去重。 */
  getId?(params: Readonly<PluginPageParams>): string;
}

export interface PluginPageHandle extends Disposable {
  readonly id: string;
  open(params?: PluginPageParams): Promise<void>;
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
