/* eslint-disable react-refresh/only-export-components -- 翻译运行时与 Hook 共用上下文。 */
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { I18nDefinition } from "./messages";
import type { I18nRuntime } from "./runtime";

const RuntimeContext = createContext<I18nRuntime | undefined>(undefined);

export function useI18nRuntime(): I18nRuntime | undefined {
  return useContext(RuntimeContext);
}

export function I18nRuntimeProvider({
  runtime,
  children,
}: {
  runtime: I18nRuntime;
  children: ReactNode;
}) {
  return createElement(RuntimeContext.Provider, { value: runtime }, children);
}

export function useI18n<Key extends string>(
  definition: I18nDefinition<Key>,
  ownerRuntime?: I18nRuntime
) {
  const inherited = useI18nRuntime();
  const runtime = ownerRuntime ?? inherited;
  if (!runtime) throw new Error("宿主未提供翻译运行时");
  const locale = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const translator = runtime.get(definition);
  return { ...translator, locale };
}
