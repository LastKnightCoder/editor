import type { McpMetadataKey } from "./metadata.messages";
/**
 * AI 助手默认自带的四件套（read / edit / write / bash）：实现在主进程由 pi 会话宿主装配，
 * 不经过渲染端工具注册表；对用户以「AI 基础工具」展示，不暴露 pi 概念。
 * 参数名与 pi 包（@earendil-works/pi-coding-agent）各工具 schema 保持一致。
 */

export interface PiBuiltinToolInfo {
  name: string;
  descriptionKey: McpMetadataKey;
  parameters: string[];
}

export const PI_BUILTIN_TOOLS: PiBuiltinToolInfo[] = [
  {
    name: "read",
    descriptionKey: "pi.read",
    parameters: ["path", "offset", "limit"],
  },
  {
    name: "edit",
    descriptionKey: "pi.edit",
    parameters: ["path", "edits"],
  },
  {
    name: "write",
    descriptionKey: "pi.write",
    parameters: ["path", "content"],
  },
  {
    name: "bash",
    descriptionKey: "pi.bash",
    parameters: ["command", "timeout"],
  },
];
