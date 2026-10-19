import * as react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";
import * as ui from "@tau/ui";
import * as sdk from "@tau/plugins";
import { sourceEditorRuntime, inlineSourceRuntime } from "@tau/editor/source";

/** 与桌面端同一份 SDK 契约；源码组件直接使用 Editor 的只读实现，不经全局运行时配置。 */
export const pluginModules: Readonly<Record<string, unknown>> = Object.freeze({
  "@tau/plugins": Object.freeze({ ...sdk, ...sourceEditorRuntime, ...inlineSourceRuntime }),
  "@tau/ui": ui,
  react,
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "react/jsx-runtime": jsx,
  "react/jsx-dev-runtime": jsxDev,
});
