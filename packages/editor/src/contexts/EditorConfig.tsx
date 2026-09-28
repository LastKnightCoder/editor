import { useEditorEnvironment } from "./EditorProvider";

/**
 * 编辑器全局配置：内核规定规范（本文件中的类型），宿主在外层通过
 * <EditorProvider config={...}> 提供取值。
 *
 * 经 EditorProvider 传播：作用域随组件树（嵌套 Provider 取最近一层）、
 * 首帧即可读取、卸载自动恢复外层。所有消费一律走 useEditorConfig()；
 * 事件回调等闭包场景应在 render 期取值后经闭包引用，不要另设全局
 * 镜像 store——嵌套 Provider 写镜像会污染外层订阅造成回写循环。
 */

export interface EditorThemeConfig {
  mode: "light" | "dark";
}

export interface EditorConfig {
  theme: EditorThemeConfig;
}

/** React 消费：Provider 内读取配置，未配置时返回 null。 */
export const useEditorConfig = (): EditorConfig | null => {
  return useEditorEnvironment().config;
};
