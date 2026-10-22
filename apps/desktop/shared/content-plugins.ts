import { ContentPluginRegistry } from "@tau/plugins/content";

/** 主进程、窗口与工作线程各自装配自己的实例，数据通过启动快照传递。 */
export const desktopContentPlugins = new ContentPluginRegistry();

export const desktopPortableSupport = new Map<string, "none" | "render" | "edit">();
