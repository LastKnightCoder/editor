import { ContentPluginRegistry } from "@tau/plugins/content";

export const mobileContentPlugins = new ContentPluginRegistry();

export const mobilePluginElementSupport = new Map<string, "none" | "render" | "edit">();
