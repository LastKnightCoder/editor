import React, { createContext, useContext, useMemo, ReactNode } from "react";

// 定义缓存类型
type MarkdownCache = Map<string, ReactNode>;

export interface MarkdownMessageMeta {
  chatId?: number;
  messageIndex?: number;
  blockIndex?: number;
  isStreaming?: boolean;
}

// 创建一个上下文来存储和提供缓存
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

// 创建一个Provider组件
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
  // 创建一个缓存实例，并确保它在组件的整个生命周期中保持稳定
  const cache = useMemo(() => new Map<string, ReactNode>(), []);

  // 创建上下文值
  const contextValue = useMemo(
    () => ({
      cache,
      isDark,
      isVisible,
      messageMeta,
    }),
    [cache, isDark, isVisible, messageMeta],
  );

  return (
    <MarkdownContext.Provider value={contextValue}>
      {children}
    </MarkdownContext.Provider>
  );
};

// 创建一个自定义hook以便于使用上下文
export const useMarkdownContext = () => useContext(MarkdownContext);

export default MarkdownContext;
