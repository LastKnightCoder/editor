import { memo, useLayoutEffect, useRef, useState } from "react";
import { useActiveTool, usePresentationState, useReadonly } from "../hooks";
import { HANDWRITE_TOOL_ID } from "../constants/tools";
import { getPrevHandwriteStyle, saveHandwriteStyle, type HandwriteStyle } from "../utils";
import { cn } from "@tau/ui";
import { AttrBarContext, ChromeBar } from "../chrome";
import { HandwriteStyleControls } from "./AttributeSetter/HandwriteSetter";

const EDGE = 8;

/** 画笔激活后挂载：每次进入画笔都从持久化样式读起，选中笔迹改过的样式也能带过来 */
const HandwriteToolBarContent = () => {
  const [style, setStyle] = useState<HandwriteStyle>(getPrevHandwriteStyle);

  const onChange = (next: HandwriteStyle) => {
    setStyle(next);
    // 创建手势落笔时读取持久化样式，写入即作用于下一笔
    saveHandwriteStyle(next);
  };

  const barRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number | null>(null);

  // 对齐到工具栏上「手写」按钮的正下方，左右不超出画布
  useLayoutEffect(() => {
    const bar = barRef.current;
    const container = bar?.offsetParent as HTMLElement | null;
    if (!bar || !container) return;
    const measure = () => {
      const anchor = [...container.querySelectorAll<HTMLElement>("[data-tool-id]")].find(
        element => element.dataset.toolId === HANDWRITE_TOOL_ID
      );
      if (!anchor) return setLeft(null);
      const anchorRect = anchor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const center = anchorRect.left + anchorRect.width / 2 - containerRect.left;
      const max = container.clientWidth - bar.offsetWidth - EDGE;
      setLeft(Math.max(EDGE, Math.min(center - bar.offsetWidth / 2, max)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <AttrBarContext.Provider value={{ side: "bottom" }}>
      <ChromeBar
        ref={barRef}
        style={left === null ? undefined : { left }}
        className={cn("top-[58px]", left === null && "left-1/2 -translate-x-1/2")}
      >
        <HandwriteStyleControls style={style} onChange={onChange} />
      </ChromeBar>
    </AttrBarContext.Provider>
  );
};

/** 画笔工具的参数条：工具栏下方居中，调的是接下来书写的笔迹样式 */
const HandwriteToolBar = memo(() => {
  const active = useActiveTool() === HANDWRITE_TOOL_ID;
  const readonly = useReadonly();
  const { isPresentationMode } = usePresentationState();
  if (!active || readonly || isPresentationMode) return null;
  return <HandwriteToolBarContent />;
});

HandwriteToolBar.displayName = "HandwriteToolBar";

export default HandwriteToolBar;
