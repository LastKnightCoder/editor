import * as plugins from "./index";
import * as whiteboard from "./whiteboard";
import * as ui from "@tau/ui";
import * as react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";

/** 仅提供模块定义；无界面宿主不会调用组件、hook 或桌面生命周期。 */
export const sharedPluginModules = Object.freeze({
  "@tau/plugins": plugins,
  "@tau/plugins/whiteboard": whiteboard,
  "@tau/ui": ui,
  react,
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "react/jsx-runtime": jsx,
  "react/jsx-dev-runtime": jsxDev,
});
