import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/metadata.zh-CN.json";
import zhTW from "./locales/metadata.zh-TW.json";
import enUS from "./locales/metadata.en-US.json";
export const mcpMetadataMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type McpMetadataKey = Parameters<typeof mcpMetadataMessages.ref>[0];
