import { definePlugin, defineI18n } from "@tau/plugins";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

export const notesPlugin = definePlugin({
  id: "example.notes",
  name: "笔记命令示例",
  i18n: messages,
  version: "1.0.0",
  create: () => {
    let executions = 0;
    return {
      activate(context) {
        context.commands.register({
          id: "remember",
          title: messages.ref("remember"),
          async run(input) {
            await context.storage.set("last-input", input);
            return { saved: true };
          },
        });
        context.commands.register({
          id: "recall",
          title: messages.ref("recall"),
          async run() {
            return (await context.storage.get("last-input")) ?? null;
          },
        });
        context.commands.register({
          id: "forget",
          title: messages.ref("forget"),
          async run() {
            await context.storage.delete("last-input");
            return { deleted: true };
          },
        });
        context.commands.register({
          id: "session-count",
          title: messages.ref("count"),
          run: () => ++executions,
        });
      },
    };
  },
});
