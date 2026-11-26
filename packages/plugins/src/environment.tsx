import { canonicalLocale, createI18nRuntime, type LocaleSource } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
/* eslint-disable react-refresh/only-export-components -- SDK 同时提供宿主环境源和 React 绑定。 */
import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createAppForegroundBridge } from "./foreground-host";
export { APP_FOREGROUND_EVENT, APP_BACKGROUND_EVENT } from "./foreground-host";

export interface PluginEnvironment {
  readonly locale: string;
  readonly platform: "desktop" | "android" | "ios" | "web";
  /** WebView 报告的可用指针精度，不代表当前输入设备或悬停能力。 */
  readonly input: Readonly<{ coarsePointer: boolean; finePointer: boolean }>;
}

export interface PluginEnvironmentSource {
  getSnapshot(): PluginEnvironment;
  subscribe(listener: () => void): () => void;
}

export type PluginEnvironmentInput = Omit<PluginEnvironment, "locale"> & {
  readonly locale?: string;
};

export function createPluginEnvironmentStore(initial: PluginEnvironmentInput) {
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
    update(patch: Partial<Pick<PluginEnvironment, "input" | "locale">>) {
      if (
        !patch ||
        typeof patch !== "object" ||
        Object.keys(patch).some(key => key !== "input" && key !== "locale")
      )
        throw new Error("会话中只能更新输入信息和界面语言");
      const next = snapshotPluginEnvironment({ ...snapshot, ...patch });
      if (
        next.locale === snapshot.locale &&
        next.input.coarsePointer === snapshot.input.coarsePointer &&
        next.input.finePointer === snapshot.input.finePointer
      )
        return;
      snapshot = next;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error("插件环境订阅执行失败", error);
        }
      }
    },
  });
}

const EnvironmentContext = createContext<PluginEnvironmentSource | undefined>(undefined);

/** 平台由宿主提供，输入信息来自媒体查询。 */
export function createBrowserPluginEnvironment(
  platform: PluginEnvironment["platform"],
  viewport: Window,
  localeSource?: LocaleSource
) {
  const coarse = viewport.matchMedia("(any-pointer: coarse)");
  const fine = viewport.matchMedia("(any-pointer: fine)");
  const read = () => ({
    input: { coarsePointer: coarse.matches, finePointer: fine.matches },
  });
  const source = createPluginEnvironmentStore({
    platform,
    locale: localeSource?.getSnapshot(),
    ...read(),
  });
  let foreground: ReturnType<typeof createAppForegroundBridge> | undefined;
  return {
    ...source,
    notifyForeground: (force = true) => foreground?.resume(force),
    notifyBackground: () => foreground?.background(),
    connect() {
      foreground?.dispose();
      const bridge = createAppForegroundBridge(viewport);
      foreground = bridge;
      const update = () =>
        source.update({
          ...read(),
          ...(localeSource ? { locale: localeSource.getSnapshot() } : {}),
        });
      const stopLocale = localeSource?.subscribe(update);
      const queries = [coarse, fine];
      queries.forEach(query => query.addEventListener("change", update));
      update();
      return () => {
        queries.forEach(query => query.removeEventListener("change", update));
        stopLocale?.();
        bridge.dispose();
        if (foreground === bridge) foreground = undefined;
      };
    },
  };
}

export function PluginEnvironmentProvider(
  props: { children: ReactNode } & (
    | { source: PluginEnvironmentSource; value?: never }
    | { value: PluginEnvironmentInput; source?: never }
  )
) {
  const source = useMemo(() => {
    if (props.source) return props.source;
    if (!props.value) throw new Error("宿主必须提供环境源或快照");
    return createPluginEnvironmentStore(props.value);
  }, [props.source, props.value]);
  const runtime = useMemo(
    () =>
      createI18nRuntime({
        localeSource: {
          getSnapshot: () => source.getSnapshot().locale,
          subscribe: listener => source.subscribe(listener),
        },
      }),
    [source]
  );
  return createElement(
    EnvironmentContext.Provider,
    { value: source },
    createElement(I18nRuntimeProvider, { runtime, children: props.children })
  );
}

/** 静态内容组件也由宿主注入环境，不依赖插件 activate。 */
export function usePluginEnvironment(): PluginEnvironment {
  const source = useContext(EnvironmentContext);
  if (!source) throw new Error("当前宿主未提供插件环境");
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

export function snapshotPluginEnvironment(value: PluginEnvironmentInput): PluginEnvironment {
  if (
    !value ||
    !["desktop", "android", "ios", "web"].includes(value.platform) ||
    !value.input ||
    typeof value.input.coarsePointer !== "boolean" ||
    typeof value.input.finePointer !== "boolean"
  )
    throw new Error("插件环境无效");
  return Object.freeze({
    locale: canonicalLocale(value.locale ?? "zh-CN"),
    platform: value.platform,
    input: Object.freeze({
      coarsePointer: value.input.coarsePointer,
      finePointer: value.input.finePointer,
    }),
  });
}
