import type { PluginPageParams } from "@tau/plugins";

export const PLUGIN_DOCK_ID = "plugin-page";

export type PluginDockTarget = {
  pluginId: string;
  pageId: string;
  mountId: number;
  instanceId: string;
  title: string;
  params: Readonly<PluginPageParams>;
};

type LeaveGuard = () => boolean | Promise<boolean>;
const guards = new Set<LeaveGuard>();
let pending: Promise<boolean> | undefined;

export function registerPluginDockGuard(guard: LeaveGuard) {
  guards.add(guard);
  pending = undefined;
  return () => {
    guards.delete(guard);
    pending = undefined;
  };
}

export function mayLeavePluginDock() {
  if (pending) return pending;
  const current = [...guards];
  const check = Promise.resolve()
    .then(async () => {
      for (const guard of current) if (guards.has(guard) && !(await guard())) return false;
      return true;
    })
    .finally(() => {
      if (pending === check) pending = undefined;
    });
  pending = check;
  return check;
}

export function hasPluginDockGuards() {
  return guards.size > 0;
}
