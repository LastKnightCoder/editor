import { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";

interface UseGridLayoutOptions {
  minWidth?: number;
  maxWidth?: number;
  gap?: number;
}

/**
 * 网格布局 Hook，根据容器宽度自动计算网格项的宽度
 * @param options 配置选项
 * @returns 网格布局相关的状态和引用
 */
const useGridLayout = (options: UseGridLayoutOptions = {}) => {
  const { minWidth = 320, maxWidth = 400, gap = 20 } = options;

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [itemWidth, setItemWidth] = useState(minWidth);

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + gap) / (maxWidth + gap));
    const nMax = Math.floor((width + gap) / (minWidth + gap));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + gap) / n - gap;

    setItemWidth(itemWidth);
  });

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [handleResize]);

  return {
    gridContainerRef,
    itemWidth,
    gap,
  };
};

export default useGridLayout;
