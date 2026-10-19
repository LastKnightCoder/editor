import * as react from "react";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";
import * as jsx from "react/jsx-runtime";
import * as jsxDev from "react/jsx-dev-runtime";
import * as ui from "../../../ui/src";
import { defineElement, defineExtension } from "../core/api/extension";
import { sourceEditorRuntime, inlineSourceRuntime } from "../../source";
import { SIDEBAR_GROUPS } from "@tau/plugins/publish-artifacts";

const plugins = Object.freeze({
  SIDEBAR_GROUPS,
  definePlugin: (definition: Record<string, unknown>) =>
    Object.freeze({
      ...definition,
      apiVersion: 1,
      create: definition.create ?? (() => ({ activate: () => undefined })),
    }),
  defineEditorElement: defineElement,
  defineEditorExtension: (definition: Parameters<typeof defineExtension>[0]) => {
    if ("plugins" in definition) throw new Error("C23 不支持原始 Slate 包装器");
    return defineExtension(definition);
  },
  ...sourceEditorRuntime,
  ...inlineSourceRuntime,
  usePluginServices: () => undefined,
});

export const pluginModules: Readonly<Record<string, unknown>> = Object.freeze({
  "@tau/plugins": plugins,
  "@tau/ui": ui,
  react,
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "react/jsx-runtime": jsx,
  "react/jsx-dev-runtime": jsxDev,
});
