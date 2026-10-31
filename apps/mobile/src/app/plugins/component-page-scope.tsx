import { useCallback, useRef, type ReactNode } from "react";
import type { PluginContext } from "@tau/plugins";
import { usePage } from "../../router";
import { usePageGuard, usePageInstanceContext } from "../../router/pageLifecycle";
import { PluginComponentScope } from "./component-scope";

export function PluginPageComponentScope({
  context,
  guard,
  children,
}: {
  context: PluginContext;
  /** 宿主自己的离开确认（如设置草稿），先于插件登记的守卫询问；页面只有一个守卫位 */
  guard?: () => boolean | Promise<boolean>;
  children: ReactNode;
}) {
  const { navigator, entryId } = usePage();
  const { phase } = usePageInstanceContext();
  const guards = useRef(new Set<() => boolean | Promise<boolean>>());
  const registerLeaveGuard = useCallback((guard: () => boolean | Promise<boolean>) => {
    guards.current.add(guard);
    return {
      dispose: () => {
        guards.current.delete(guard);
      },
    };
  }, []);
  usePageGuard(async () => {
    if (guard && !(await guard())) return false;
    if (context.signal.aborted) return true;
    for (const guard of guards.current) if (!(await guard())) return false;
    return true;
  });
  const activeNow = useCallback(
    () => (navigator.getTopOverlay() ?? navigator.getActiveScreen())?.id === entryId,
    [navigator, entryId]
  );
  return (
    <PluginComponentScope
      context={context}
      active={phase === "active"}
      activeNow={activeNow}
      registerLeaveGuard={registerLeaveGuard}
    >
      {children}
    </PluginComponentScope>
  );
}
