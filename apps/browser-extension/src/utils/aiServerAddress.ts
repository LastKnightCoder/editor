/** 桌面端 aiServer WebSocket 通道地址（流式聊天与 chat.* 会话存储命令共用） */
export const AI_SERVER_WS_PORT = 24678;
export const AI_SERVER_WS_URL = `ws://localhost:${AI_SERVER_WS_PORT}/aiServer`;
/**
 * 桌面主进程通道（协议 v2，M5）：侧栏持久对话的运行（ai.run.*）由主进程直接驱动 pi 宿主会话，
 * 渲染层重载不中断。一次性调用与其它命令仍走 AI_SERVER_WS_URL。
 */
export const AI_SERVER_MAIN_WS_URL = `ws://localhost:${AI_SERVER_WS_PORT}/aiServerMain`;
