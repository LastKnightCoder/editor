import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Disposable, PluginContext } from "@tau/plugins";
import { useMobilePlugins } from "./context";

type ComponentScope = {
  context: PluginContext;
  active: boolean;
  activeNow?: () => boolean;
  id: number;
  registerLeaveGuard?: (guard: () => boolean | Promise<boolean>) => Disposable;
};
const ScopeContext = createContext<ComponentScope | null>(null);
const ids = new WeakMap<PluginContext, number>();
let nextId = 0;

export function PluginComponentScope({
  context,
  active,
  activeNow,
  registerLeaveGuard,
  children,
}: Omit<ComponentScope, "id"> & { children: ReactNode }) {
  const value = useMemo(() => {
    let id = ids.get(context);
    if (id === undefined) {
      id = ++nextId;
      ids.set(context, id);
    }
    return { context, active, activeNow, registerLeaveGuard, id };
  }, [context, active, activeNow, registerLeaveGuard]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export const usePluginComponentScope = () => useContext(ScopeContext);
const noopSubscribe = () => () => undefined;
const zero = () => 0;

export function usePluginComponentState() {
  const scope = usePluginComponentScope();
  const runtime = useMobilePlugins();
  const broker = runtime?.permissions;
  const revision = useSyncExternalStore(
    broker?.subscribe ?? noopSubscribe,
    broker?.getSnapshot ?? zero,
    zero
  );
  const signal = scope?.context.signal;
  const subscribeAbort = useCallback(
    (listener: () => void) => {
      signal?.addEventListener("abort", listener);
      return () => signal?.removeEventListener("abort", listener);
    },
    [signal]
  );
  const readAbort = useCallback(() => signal?.aborted ?? true, [signal]);
  const aborted = useSyncExternalStore(subscribeAbort, readAbort, readAbort);
  const active = !!scope?.active && !aborted && !!runtime?.active(scope.context);
  useEffect(() => {
    if (!active || !scope || !runtime?.events) return;
    const subscription = runtime.events.adapter.subscribe(scope.context, () => undefined);
    return () => {
      void subscription.dispose();
    };
  }, [active, scope?.context, runtime]);
  const latest = useRef({ scope, runtime, active });
  latest.current = { scope, runtime, active };
  const isActive = useCallback(() => {
    const value = latest.current;
    return (
      value.active &&
      !!value.scope &&
      (value.scope.activeNow?.() ?? true) &&
      !value.scope.context.signal.aborted &&
      !!value.runtime?.active(value.scope.context)
    );
  }, []);
  return { scope, runtime, revision, active, isActive };
}
