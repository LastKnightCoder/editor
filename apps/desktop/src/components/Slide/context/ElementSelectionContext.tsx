import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

export interface ElementSelectionState {
  /** 是否处于选择模式 */
  isSelecting: boolean;
  /** 当前选择关联的动画 ID */
  selectingAnimationId: string | null;
  /** 当前选中的元素路径 */
  selectedPaths: Set<string>;
}

export interface ElementSelectionActions {
  /** 开始选择模式 */
  startSelection: (animationId: string, initialPaths?: string[]) => void;
  /** 结束选择模式 */
  endSelection: () => void;
  /** 切换路径选中状态 */
  togglePath: (path: string) => void;
  /** 添加路径 */
  addPath: (path: string) => void;
  /** 移除路径 */
  removePath: (path: string) => void;
  /** 清空选中 */
  clearSelection: () => void;
  /** 确认选择并返回结果 */
  confirmSelection: () => string[];
}

export interface ElementSelectionContextValue
  extends ElementSelectionState,
    ElementSelectionActions {}

const ElementSelectionContext =
  createContext<ElementSelectionContextValue | null>(null);

interface ElementSelectionProviderProps {
  children: ReactNode;
  /** 选择确认时的回调 */
  onSelectionConfirm?: (animationId: string, paths: string[]) => void;
}

export const ElementSelectionProvider = ({
  children,
  onSelectionConfirm,
}: ElementSelectionProviderProps) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectingAnimationId, setSelectingAnimationId] = useState<
    string | null
  >(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const startSelection = useCallback(
    (animationId: string, initialPaths: string[] = []) => {
      setIsSelecting(true);
      setSelectingAnimationId(animationId);
      setSelectedPaths(new Set(initialPaths));
    },
    [],
  );

  const endSelection = useCallback(() => {
    setIsSelecting(false);
    setSelectingAnimationId(null);
    setSelectedPaths(new Set());
  }, []);

  const togglePath = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const addPath = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const removePath = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  const confirmSelection = useCallback(() => {
    const paths = Array.from(selectedPaths);
    if (selectingAnimationId && onSelectionConfirm) {
      onSelectionConfirm(selectingAnimationId, paths);
    }
    endSelection();
    return paths;
  }, [selectedPaths, selectingAnimationId, onSelectionConfirm, endSelection]);

  const value = useMemo<ElementSelectionContextValue>(
    () => ({
      isSelecting,
      selectingAnimationId,
      selectedPaths,
      startSelection,
      endSelection,
      togglePath,
      addPath,
      removePath,
      clearSelection,
      confirmSelection,
    }),
    [
      isSelecting,
      selectingAnimationId,
      selectedPaths,
      startSelection,
      endSelection,
      togglePath,
      addPath,
      removePath,
      clearSelection,
      confirmSelection,
    ],
  );

  return (
    <ElementSelectionContext.Provider value={value}>
      {children}
    </ElementSelectionContext.Provider>
  );
};

export const useElementSelection = () => {
  const context = useContext(ElementSelectionContext);
  if (!context) {
    throw new Error(
      "useElementSelection must be used within an ElementSelectionProvider",
    );
  }
  return context;
};

export default ElementSelectionContext;
