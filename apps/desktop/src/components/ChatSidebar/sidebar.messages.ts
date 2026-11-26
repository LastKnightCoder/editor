import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/sidebar.zh-CN.json";
import zhTW from "./locales/sidebar.zh-TW.json";
import enUS from "./locales/sidebar.en-US.json";
export const sidebarMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SidebarMessageKey = Parameters<typeof sidebarMessages.ref>[0];
