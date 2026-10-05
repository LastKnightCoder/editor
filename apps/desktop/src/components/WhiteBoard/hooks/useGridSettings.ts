import { useMemoizedFn } from "ahooks";
import { useLocalStorageState } from "ahooks";
import { DEFAULT_GRID_VISIBLE } from "../constants";

/**
 * 点阵开关（全局 localStorage）；点距固定为 DEFAULT_GRID_SIZE
 */
const useGridSettings = () => {
  const [gridVisible, setGridVisible] = useLocalStorageState<boolean>("gridVisible", {
    defaultValue: DEFAULT_GRID_VISIBLE,
  });

  const handleGridVisibleChange = useMemoizedFn((visible: boolean) => {
    setGridVisible(visible);
  });

  return {
    gridVisible,
    handleGridVisibleChange,
  };
};

export default useGridSettings;
