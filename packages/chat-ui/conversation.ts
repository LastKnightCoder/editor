/**
 * 对话消息渲染入口（不含聊天容器）：消息、思考、工具行与工具块、代码块、Markdown、工具卡片与交互件。
 * 浏览器扩展这类不想带上整个 @tau/shared 主入口的宿主从这里引；桌面也可以继续用主入口。
 */
export * from "./src/components/ChatComponents/index.ts";
export * from "./src/components/Message/index.ts";
export {
  default as MarkdownRenderer,
  type MarkdownRendererProps,
} from "./src/components/MarkdownRenderer/index.tsx";
export * from "./src/components/ToolCard/index.tsx";
export * from "./src/interactions/index.ts";
