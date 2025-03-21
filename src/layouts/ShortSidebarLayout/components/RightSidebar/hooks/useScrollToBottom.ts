import { useCallback, useState, RefObject } from "react";
import { useMemoizedFn } from "ahooks";

/**
 * 自定义 Hook 用于管理聊天界面中的滚动到底部行为
 * @param scrollRef 可滚动元素的引用
 * @param initialAutoScroll 是否初始自动滚动
 * @returns 包含滚动状态和控制函数的对象
 */
export default function useScrollToBottom(
  scrollRef: RefObject<HTMLElement>,
  initialAutoScroll = true,
) {
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);

  // 滚动到容器底部
  const scrollDomToBottom = useCallback(() => {
    if (!scrollRef.current) return;

    const scrollElement = scrollRef.current;
    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [scrollRef]);

  // 处理滚动事件
  const onChatBodyWheel = useMemoizedFn(
    (ele: HTMLElement, e: React.WheelEvent<HTMLElement>) => {
      const bottomHeight = ele.scrollTop + ele.clientHeight;
      const isHitBottom = bottomHeight >= ele.scrollHeight - 10;

      // 获取滚动方向
      const scrollDirection = e.deltaY > 0 ? "down" : "up";

      setAutoScroll(isHitBottom && scrollDirection === "down");
    },
  );

  return {
    autoScroll,
    scrollDomToBottom,
    onChatBodyWheel,
  };
}
