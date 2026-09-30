/**
 * AI 助手默认自带的四件套（read / edit / write / bash）：实现在主进程由 pi 会话宿主装配，
 * 不经过渲染端工具注册表；对用户以「AI 基础工具」展示，不暴露 pi 概念。
 * 参数名与 pi 包（@earendil-works/pi-coding-agent）各工具 schema 保持一致。
 */

export interface PiBuiltinToolInfo {
  name: string;
  description: string;
  parameters: string[];
}

export const PI_BUILTIN_TOOLS: PiBuiltinToolInfo[] = [
  {
    name: "read",
    description: "读取本地文件内容（文本或图片），支持 offset / limit 分段读取。",
    parameters: ["path", "offset", "limit"],
  },
  {
    name: "edit",
    description: "按 oldText / newText 精确字符串对编辑本地文件，一次可做多处不重叠修改。",
    parameters: ["path", "edits"],
  },
  {
    name: "write",
    description: "创建或整体覆写本地文件。",
    parameters: ["path", "content"],
  },
  {
    name: "bash",
    description: "执行 shell 命令（Windows 上为 PowerShell），可设超时。",
    parameters: ["command", "timeout"],
  },
];
