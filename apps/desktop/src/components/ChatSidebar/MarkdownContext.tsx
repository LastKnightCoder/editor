import React, { createContext, useContext, useMemo, ReactNode } from "react";

// 定义缓存类型
type MarkdownCache = Map<string, ReactNode>;

export interface MarkdownMessageMeta {
  /** 对话 id（pi 会话 id）；非会话场景（行内 AI）为空 */
  chatId?: string;
  messageIndex?: number;
  blockIndex?: number;
  isStreaming?: boolean;
  isLastTextBlock?: boolean; // 是否是最后一个 text block
  textContent?: string; // 完整的 text block 内容，用于判断代码块是否已完成生成
}

interface MarkdownContextType {
  cache: MarkdownCache;
  isDark: boolean;
  isVisible: boolean;
  messageMeta?: MarkdownMessageMeta;
}

const MarkdownContext = createContext<MarkdownContextType>({
  cache: new Map(),
  isDark: false,
  isVisible: false,
  messageMeta: undefined,
});

interface MarkdownProviderProps {
  children: ReactNode;
  isDark: boolean;
  isVisible: boolean;
  messageMeta?: MarkdownMessageMeta;
}

export const MarkdownProvider: React.FC<MarkdownProviderProps> = ({
  children,
  isDark,
  isVisible,
  messageMeta,
}) => {
  const cache = useMemo(() => new Map<string, ReactNode>(), []);

  const contextValue = useMemo(
    () => ({
      cache,
      isDark,
      isVisible,
      messageMeta,
    }),
    [cache, isDark, isVisible, messageMeta]
  );

  return <MarkdownContext.Provider value={contextValue}>{children}</MarkdownContext.Provider>;
};

export const useMarkdownContext = () => useContext(MarkdownContext);

export default MarkdownContext;
