import { useTabContext } from "@/contexts/TabContext";
import { TabType, TabParams } from "@/types/tab";

function useTabParams<T extends TabType>(expectedType: T): TabParams[T] {
  const context = useTabContext();

  const { tab } = context;

  // 类型检查（仅在开发环境）
  if (process.env.NODE_ENV === "development") {
    if (tab.type !== expectedType) {
      console.warn(
        `useTabParams: Expected tab type "${expectedType}" but got "${tab.type}"`,
      );
    }
  }

  return (tab.params || {}) as TabParams[T];
}

export default useTabParams;
