import { definePlugin } from "@tau/plugins";
import { ReadingSettings } from "./ReadingSettings";

export const settingsPlugin = definePlugin({
  id: "example.settings",
  name: "自定义设置示例",
  version: "1.0.0",
  create: () => ({
    activate(context) {
      const settings = context.settings.register({
        id: "reading",
        title: "阅读偏好（示例）",
        description: "按当前工作区保存的插件私有偏好，修改后立即保存。",
        component: ReadingSettings,
      });
      context.commands.register({
        id: "open-settings",
        title: "打开插件设置示例",
        async run() {
          await settings.open();
          return null;
        },
      });
    },
  }),
});
