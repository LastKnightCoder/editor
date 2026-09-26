// Role 枚举统一维护在 @tau/shared/chat-core；走子路径导入，避免主进程 bundle 引入 UI 包
export { Role } from "@tau/shared/src/chat-core/messages";
