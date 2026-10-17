/** 无 React/DOM 运行时代码的声明入口，供应用 SDK 适配现有扩展协议。 */
export { defineExtension, defineElement } from "./src/api/extension";
export type { EditorExtension, ElementSpec, ElementRenderProps } from "./src/api/extension";
