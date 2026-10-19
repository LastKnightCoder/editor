import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";

/** 仅覆盖本次真实计数插件所用的 API，不冒充完整公开 SDK 实现。 */
export const sharedModules: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsx,
  "react/jsx-dev-runtime": jsxDev,
  "@tau/plugins": {
    definePlugin: (definition: object) => ({
      ...definition,
      apiVersion: 1,
      create: () => {
        throw new Error("站点不应执行桌面生命周期");
      },
    }),
    defineEditorExtension: (definition: object) => ({ ...definition, apiVersion: 1 }),
    defineEditorElement: (definition: object) => definition,
  },
  "@tau/ui": {
    Button: (props: React.ComponentProps<"button">) => <button {...props} />,
  },
};
