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
  updateBlockContent: (blockId: string, block: BlockData) => void;

  // 辅助方法
  isBlockActive: (blockId: string) => boolean;
}

const BlockPreviewContext = createContext<BlockPreviewContextValue | undefined>(
  undefined,
);

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
      isLoading: false,
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

  const updateBlockContent = useCallback(
    (blockId: string, block: BlockData) => {
      setState((prev) => {
        // 只有当前正在预览的块ID匹配时才更新
        if (prev.currentBlock?.id === blockId && prev.isOpen) {
          return {
            ...prev,
            currentBlock: block,
          };
        }
        return prev;
      });
    },
    [],
  );

  const isBlockActive = useCallback(
    (blockId: string) => {
      return state.currentBlock?.id === blockId && state.isOpen;
    },
    [state.currentBlock, state.isOpen],
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
