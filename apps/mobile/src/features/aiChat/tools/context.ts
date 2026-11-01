import { createContext, useContext } from "react";

/** 工具展示需要的页面能力：打开内容预览（复用对话页的引用预览面板） */
export interface ChatToolHost {
  openReference(id: number, type: string, title: string): void;
  isDark: boolean;
}

export const ChatToolContext = createContext<ChatToolHost>({
  openReference: () => undefined,
  isDark: false,
});

export const useChatToolHost = () => useContext(ChatToolContext);
