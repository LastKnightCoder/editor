import { useMemoizedFn } from "ahooks";
import { useLocalStorageState } from "ahooks";
import { DEFAULT_GRID_SIZE, DEFAULT_GRID_VISIBLE, GRID_SIZE_OPTIONS } from "../constants";

/**
 * 网格设置相关 hook
 */
const useGridSettings = () => {
  const [gridVisible, setGridVisible] = useLocalStorageState<boolean>("gridVisible", {
    defaultValue: DEFAULT_GRID_VISIBLE,
  });

  const [storedGridSize, setGridSize] = useLocalStorageState<number>("gridSize", {
    defaultValue: DEFAULT_GRID_SIZE,
  });
  // 不在当前点距档位里的值（如旧网格档位 100）按默认点距处理
  const gridSize = GRID_SIZE_OPTIONS.some(o => o.value === storedGridSize)
    ? storedGridSize
    : DEFAULT_GRID_SIZE;

  const handleGridVisibleChange = useMemoizedFn((visible: boolean) => {
    setGridVisible(visible);
  });

  const handleGridSizeChange = useMemoizedFn((size: number) => {
    setGridSize(size);
  });

  return {
    gridVisible,
    gridSize,
    handleGridVisibleChange,
    handleGridSizeChange,
  };
};

export default useGridSettings;
