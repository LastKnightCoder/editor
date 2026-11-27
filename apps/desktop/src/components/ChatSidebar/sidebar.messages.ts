import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/sidebar.zh-CN.json";
import zhTW from "./locales/sidebar.zh-TW.json";
import enUS from "./locales/sidebar.en-US.json";
import mindMapZhCN from "./locales/mindmap.zh-CN.json";
import mindMapZhTW from "./locales/mindmap.zh-TW.json";
import mindMapEnUS from "./locales/mindmap.en-US.json";
export const sidebarMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SidebarMessageKey = Parameters<typeof sidebarMessages.ref>[0];
export const mindMapMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": mindMapZhCN, "zh-TW": mindMapZhTW, "en-US": mindMapEnUS },
});
export type MindMapMessageKey = Parameters<typeof mindMapMessages.ref>[0];
