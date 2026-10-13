import { definePlugin } from "@tau/plugins";

export const notesPlugin = definePlugin({
  id: "example.notes",
  name: "笔记命令示例",
  version: "1.0.0",
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "remember",
        title: "保存最近输入",
        async run(input) {
          await context.storage.set("last-input", input);
          return { saved: true };
        },
      });
      context.commands.register({
        id: "recall",
        title: "读取最近输入",
        async run() {
          return (await context.storage.get("last-input")) ?? null;
        },
      });
    },
  }),
});
