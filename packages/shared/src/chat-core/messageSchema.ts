/** 聊天消息 clientId 生成（纯函数）。桌面 src/services/chatMessageSchema.ts 对本文件为 re-export 关系。 */
import { v4 as uuidv4 } from "uuid";

export const createChatMessageClientId = () => `msg:${uuidv4()}`;
