import structureZhCN from "./locales/menus-structure.zh-CN.json" with { type: "json" };
import structureZhTW from "./locales/menus-structure.zh-TW.json" with { type: "json" };
import structureEnUS from "./locales/menus-structure.en-US.json" with { type: "json" };
import menusZhCN from "./locales/menus.zh-CN.json" with { type: "json" };
import menusZhTW from "./locales/menus.zh-TW.json" with { type: "json" };
import menusEnUS from "./locales/menus.en-US.json" with { type: "json" };
import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/tools.zh-CN.json" with { type: "json" };
import zhTW from "./locales/tools.zh-TW.json" with { type: "json" };
import enUS from "./locales/tools.en-US.json" with { type: "json" };

export const whiteboardMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: {
    "zh-CN": { ...zhCN, ...menusZhCN, ...structureZhCN },
    "zh-TW": { ...zhTW, ...menusZhTW, ...structureZhTW },
    "en-US": { ...enUS, ...menusEnUS, ...structureEnUS },
  },
});
export type WhiteboardMessageKey = Parameters<typeof whiteboardMessages.ref>[0];
