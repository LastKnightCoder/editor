import * as plugins from "@tau/plugins";
// eslint-disable-next-line no-restricted-imports -- 宿主模块映射保留 UI 导出身份，此处不发送业务通知。
import * as ui from "@tau/ui";
import * as react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";

export const sharedPluginModules = Object.freeze({
  "@tau/plugins": plugins,
  "@tau/ui": ui,
  react,
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "react/jsx-runtime": jsx,
  "react/jsx-dev-runtime": jsxDev,
});
