import { useMemo, useSyncExternalStore } from "react";
import type { MobilePluginRuntime } from "../app/plugins/runtime";
import type { MobilePluginEntityTarget } from "../app/plugins/app-types";

export type { MobilePluginEntityTarget } from "../app/plugins/app-types";
let current: MobilePluginRuntime | null = null;
let revision = 0;
const listeners = new Set<() => void>();
const publish = () => {
  revision++;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => revision;
export function useMobileEntityHostRevision(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function isMobileEntityMentionable(pluginId: string, kind: string): boolean {
  const registration = current?.entityKinds.get(JSON.stringify([pluginId, kind]));
  return !!(registration?.definition.mentionable && current?.active(registration.context));
}

/** 普通应用入口使用当前宿主；迟到查询不能借新工作区的类型注册跳转。 */
export function installMobileEntityHost(runtime: MobilePluginRuntime) {
  current = runtime;
  const stop = runtime.subscribe(publish);
  publish();
  return () => {
    stop();
    if (current === runtime) {
      current = null;
      publish();
    }
  };
}
export function useMobileMentionableEntityKinds(): readonly { pluginId: string; kind: string }[] {
  const version = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(
    () =>
      Object.freeze(
        [...(current?.entityKinds.values() ?? [])]
          .filter(item => item.definition.mentionable && current?.active(item.context))
          .map(item => ({ pluginId: item.context.pluginId, kind: item.definition.kind }))
      ),
    [version]
  );
}
export async function getMobilePluginEntityMetadata(
  id: number,
  expectedContentId?: number
): Promise<MobilePluginEntityTarget | null> {
  const runtime = current;
  if (!runtime?.app) throw new Error("插件宿主尚未就绪，请稍后重试");
  const result = await runtime.app.getEntityTarget(id);
  if (current !== runtime) throw new Error("工作区已切换");
  if (result && expectedContentId !== undefined && result.contentId !== expectedContentId)
    return null;
  return result;
}
export async function openMobilePluginEntity(
  id: number,
  options?: { expectedContentId?: number; expectedCreatedAt?: number; at?: string }
): Promise<void> {
  const runtime = current;
  const target = await getMobilePluginEntityMetadata(id, options?.expectedContentId);
  if (!target) throw new Error("插件内容已删除或身份已变化");
  if (current !== runtime || !runtime) throw new Error("工作区已切换");
  if (options?.expectedCreatedAt !== undefined && target.createdAt !== options.expectedCreatedAt)
    throw new Error("插件内容身份已变化");
  await runtime.openEntityTarget(target, options?.at, () => {
    if (current !== runtime) throw new Error("工作区已切换");
  });
}
