import { definePlugin } from "@tau/plugins";
import { createElement } from "react";
import { WeReadNotebooks } from "./WeReadNotebooks";

export const createWeReadPlugin = (getApiKey: () => string) =>
  definePlugin({
    id: "example.weread",
    name: "微信读书服务验证",
    version: "1.0.0",
    create: () => ({
      activate(context) {
        const page = context.pages.register({
          id: "notebooks",
          title: "微信读书笔记书单",
          component: props => createElement(WeReadNotebooks, { ...props, getApiKey }),
        });
        context.commands.register({
          id: "open",
          title: "打开微信读书笔记书单",
          async run() {
            await page.open();
            return null;
          },
        });
      },
    }),
  });
