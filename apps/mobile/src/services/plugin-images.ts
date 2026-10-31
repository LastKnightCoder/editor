import type { MobilePluginRuntime } from "../app/plugins/runtime";

let current: { runtime: MobilePluginRuntime; lifetime: AbortController } | null = null;

export function installMobileImageHost(runtime: MobilePluginRuntime) {
  current?.lifetime.abort(new DOMException("图片宿主已更换", "AbortError"));
  const host = { runtime, lifetime: new AbortController() };
  current = host;
  return () => {
    host.lifetime.abort(new DOMException("图片宿主已结束", "AbortError"));
    if (current === host) current = null;
  };
}

export function getMobileImageHost(database: string) {
  if (!current || !current.runtime.isAvailable || current.runtime.workspaceId !== database)
    throw new Error("图片插件宿主尚未就绪，请稍后重试");
  return { runtime: current.runtime, signal: current.lifetime.signal };
}
