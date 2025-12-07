import { useMemoizedFn } from "ahooks";
import { useLocalStorageState } from "ahooks";
import { DEFAULT_GRID_SIZE, DEFAULT_GRID_VISIBLE } from "../constants";

/**
 * 网格设置相关 hook
 */
const useGridSettings = () => {
  const [gridVisible, setGridVisible] = useLocalStorageState<boolean>(
    "gridVisible",
    { defaultValue: DEFAULT_GRID_VISIBLE },
  );

  const [gridSize, setGridSize] = useLocalStorageState<number>("gridSize", {
    defaultValue: DEFAULT_GRID_SIZE,
  });

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
