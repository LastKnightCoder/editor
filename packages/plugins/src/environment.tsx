/* eslint-disable react-refresh/only-export-components -- SDK 同时提供宿主环境源和 React 绑定。 */
import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { readPluginCapabilities, type PluginCapability } from "./capabilities";

export interface PluginEnvironment {
  readonly platform: "desktop" | "android" | "ios" | "web" | "unknown";
  readonly layout: "compact" | "wide" | "unknown";
  readonly input: Readonly<{ touch: boolean; finePointer: boolean }>;
  /** 可用能力，不代表数据授权或代码隔离。 */
  readonly capabilities: readonly PluginCapability[];
}

export interface PluginEnvironmentSource {
  getSnapshot(): PluginEnvironment;
  subscribe(listener: () => void): () => void;
}

export function createPluginEnvironmentStore(initial: PluginEnvironment) {
  let snapshot = snapshotPluginEnvironment(initial);
  const listeners = new Set<() => void>();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(patch: Partial<Pick<PluginEnvironment, "layout" | "input">>) {
      if (
        !patch ||
        typeof patch !== "object" ||
        Object.keys(patch).some(key => key !== "layout" && key !== "input")
      )
        throw new Error("会话中只能更新布局与输入能力");
      const next = snapshotPluginEnvironment({ ...snapshot, ...patch });
      if (
        next.layout === snapshot.layout &&
        next.input.touch === snapshot.input.touch &&
        next.input.finePointer === snapshot.input.finePointer
      )
        return;
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  });
}

const EnvironmentContext = createContext<PluginEnvironmentSource | undefined>(undefined);

/** 由宿主显式选择平台；媒体查询只描述布局和输入，不用于猜测操作系统。 */
export function createBrowserPluginEnvironment(
  platform: PluginEnvironment["platform"],
  capabilities: readonly PluginCapability[],
  viewport: Window
) {
  const compact = viewport.matchMedia("(max-width: 767px)");
  const touch = viewport.matchMedia("(any-pointer: coarse)");
  const fine = viewport.matchMedia("(any-pointer: fine)");
  const read = () => ({
    layout: compact.matches ? ("compact" as const) : ("wide" as const),
    input: { touch: touch.matches, finePointer: fine.matches },
  });
  const source = createPluginEnvironmentStore({ platform, capabilities, ...read() });
  return {
    ...source,
    connect() {
      const update = () => source.update(read());
      const queries = [compact, touch, fine];
      queries.forEach(query => query.addEventListener("change", update));
      update();
      return () => queries.forEach(query => query.removeEventListener("change", update));
    },
  };
}

export function PluginEnvironmentProvider(
  props: { children: ReactNode } & (
    | { source: PluginEnvironmentSource; value?: never }
    | { value: PluginEnvironment; source?: never }
  )
) {
  const source = useMemo(() => {
    if (props.source) return props.source;
    if (!props.value) throw new Error("宿主必须提供环境源或快照");
    return createPluginEnvironmentStore(props.value);
  }, [props.source, props.value]);
  return createElement(EnvironmentContext.Provider, { value: source }, props.children);
}

/** 静态内容组件也由宿主注入环境，不依赖插件 activate。 */
export function usePluginEnvironment(): PluginEnvironment {
  const source = useContext(EnvironmentContext);
  if (!source) throw new Error("当前宿主未提供插件环境");
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

export function snapshotPluginEnvironment(value: PluginEnvironment): PluginEnvironment {
  if (
    !value ||
    !["desktop", "android", "ios", "web", "unknown"].includes(value.platform) ||
    !["compact", "wide", "unknown"].includes(value.layout) ||
    !value.input ||
    typeof value.input.touch !== "boolean" ||
    typeof value.input.finePointer !== "boolean" ||
    !Array.isArray(value.capabilities)
  )
    throw new Error("插件环境无效");
  return Object.freeze({
    ...value,
    input: Object.freeze({ ...value.input }),
    capabilities: readPluginCapabilities(value.capabilities),
  });
}
