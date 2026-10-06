/**
 * 注意走子路径导入：主进程 bundle 会包含本文件，不能引 @tau/shared 主入口（UI 包）。
 */
export { createChatMessageClientId } from "@tau/shared/chat-core";
