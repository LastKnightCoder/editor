import { createContext, createElement, useContext, type ReactNode } from "react";

export interface PluginEnvironment {
  readonly platform: "desktop" | "android" | "ios" | "unknown";
  readonly layout: "compact" | "wide" | "unknown";
  readonly input: Readonly<{ touch: boolean; finePointer: boolean }>;
  /** 可用能力，不代表数据授权或代码隔离。 */
  readonly capabilities: readonly string[];
}

const EnvironmentContext = createContext<PluginEnvironment | undefined>(undefined);

export function PluginEnvironmentProvider({
  value,
  children,
}: {
  value: PluginEnvironment;
  children: ReactNode;
}) {
  return createElement(EnvironmentContext.Provider, { value }, children);
}

/** 静态内容组件也由宿主注入环境，不依赖插件 activate。 */
export function usePluginEnvironment(): PluginEnvironment {
  const environment = useContext(EnvironmentContext);
  if (!environment) throw new Error("当前宿主未提供插件环境");
  return environment;
}

export function snapshotPluginEnvironment(value: PluginEnvironment): PluginEnvironment {
  if (
    !["desktop", "android", "ios", "unknown"].includes(value.platform) ||
    !["compact", "wide", "unknown"].includes(value.layout) ||
    typeof value.input.touch !== "boolean" ||
    typeof value.input.finePointer !== "boolean" ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.some(item => typeof item !== "string")
  )
    throw new Error("插件环境无效");
  return Object.freeze({
    ...value,
    input: Object.freeze({ ...value.input }),
    capabilities: Object.freeze([...new Set(value.capabilities)]),
  });
}
