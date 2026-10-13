import { createElement } from "react";
import { definePlugin } from "@tau/plugins";
import { Details, Overview } from "./SamplePages";

export const notesPlugin = definePlugin({
  id: "example.desktop-pages",
  name: "页面与偏好示例",
  version: "1.0.0",
  create: () => ({
    activate(context) {
      const details = context.pages.register({
        id: "details",
        title: "示例条目",
        match: "params",
        getId: params => String(params.book ?? ""),
        component: Details,
      });
      const overview = context.pages.register({
        id: "overview",
        title: "插件页面示例",
        component: props => createElement(Overview, { ...props, details }),
      });
      context.commands.register({
        id: "open",
        title: "打开插件页面示例",
        async run() {
          await overview.open();
          return null;
        },
      });
    },
  }),
});
