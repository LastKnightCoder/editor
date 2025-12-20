import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { BlockData, BlockPreviewState } from "@/types/block-preview";

interface BlockPreviewContextValue {
  // 状态
  state: BlockPreviewState;

  // 操作
  openPreview: (block: BlockData) => void;
  closePreview: () => void;
  setLoading: (loading: boolean) => void;
  updateBlockContent: (block: BlockData) => void;

  // 辅助方法
  isBlockActive: (block: BlockData) => boolean;
}

const BlockPreviewContext = createContext<BlockPreviewContextValue | undefined>(
  undefined,
);

const isSameBlock = (a: BlockData | null, b: BlockData | null): boolean => {
  if (!a || !b) return false;
  if (a.id === b.id) return true;

  // 同一对话、同一消息、同一块序号视为同一块
  const sameContext =
    a.metadata.sourceChatId != null &&
    b.metadata.sourceChatId != null &&
    a.metadata.sourceChatId === b.metadata.sourceChatId &&
    a.metadata.sourceMessageIndex != null &&
    b.metadata.sourceMessageIndex != null &&
    a.metadata.sourceMessageIndex === b.metadata.sourceMessageIndex &&
    a.metadata.blockIndex != null &&
    b.metadata.blockIndex != null &&
    a.metadata.blockIndex === b.metadata.blockIndex;

  return sameContext;
};

export const BlockPreviewProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<BlockPreviewState>({
    currentBlock: null,
    isOpen: false,
    isLoading: false,
  });

  const openPreview = useCallback((block: BlockData) => {
    setState({
      currentBlock: block,
      isOpen: true,
      isLoading: !!block.metadata.isGenerating,
    });
  }, []);

  const closePreview = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));

    // 延迟清除 currentBlock，保持动画流畅
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        currentBlock: null,
      }));
    }, 300);
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading: loading,
    }));
  }, []);

  const updateBlockContent = useCallback((block: BlockData) => {
    setState((prev) => {
      if (!prev.isOpen || !isSameBlock(prev.currentBlock, block)) {
        return prev;
      }

      const mergedBlock: BlockData = {
        ...block,
        id: block.id || prev.currentBlock?.id || block.id,
        metadata: {
          ...prev.currentBlock?.metadata,
          ...block.metadata,
        },
      };

      return {
        ...prev,
        currentBlock: mergedBlock,
        isLoading: block.metadata.isGenerating ?? prev.isLoading,
      };
    });
  }, []);

  const isBlockActive = useCallback(
    (block: BlockData) => {
      return state.isOpen && isSameBlock(state.currentBlock, block);
    },
    [state],
  );

  const value = useMemo(
    () => ({
      state,
      openPreview,
      closePreview,
      setLoading,
      updateBlockContent,
      isBlockActive,
    }),
    [
      state,
      openPreview,
      closePreview,
      setLoading,
      updateBlockContent,
      isBlockActive,
    ],
  );

  return (
    <BlockPreviewContext.Provider value={value}>
      {children}
    </BlockPreviewContext.Provider>
  );
};

export const useBlockPreview = () => {
  const context = useContext(BlockPreviewContext);
  if (!context) {
    throw new Error("useBlockPreview must be used within BlockPreviewProvider");
  }
  return context;
};
