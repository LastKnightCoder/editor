import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@tau/ui";
import { ChromeBar, ChromeGap, ToolbarContext } from "../../chrome";
import { useActiveTool, useBoard } from "../../hooks";
import usePresentationState from "../../hooks/usePresentationState";
import ExtensionTools from "./ExtensionTools";

/** tau 命名空间工具直接上工具栏；第三方工具收进「扩展工具」菜单 */
const isTauTool = (id: string) => id.startsWith("tau.");

interface IndicatorState {
  left: number;
  width: number;
  opacity: number;
}

const HIDDEN_INDICATOR: IndicatorState = { left: 0, width: 0, opacity: 0 };

/**
 * 画布顶部工具栏：激活工具由滑动指示块（accent-soft 底块）标注，
 * 按钮本体只改文字色（ChromeButton 经 ToolbarContext 感知此语境）。
 */
const Toolbar = memo(() => {
  const board = useBoard();
  const { isPresentationMode } = usePresentationState();
  const activeTool = useActiveTool();
  const barRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [indicator, setIndicator] = useState<IndicatorState>(HIDDEN_INDICATOR);

  const tools = useMemo(() => board.extensions?.tools ?? [], [board.extensions]);
  const barTools = useMemo(() => tools.filter(tool => isTauTool(tool.id)), [tools]);
  const hasExternalTools = useMemo(() => tools.some(tool => !isTauTool(tool.id)), [tools]);

  // 定位：激活工具的包裱 span（第三方工具对准「扩展工具」入口），找不到时隐藏
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    // 工具 id 的名称段不受字符集限制，不做属性选择器拼接，按 dataset 逐个比对
    const target = isTauTool(activeTool)
      ? [...bar.querySelectorAll<HTMLElement>("[data-tool-id]")].find(
          element => element.dataset.toolId === activeTool
        )
      : (bar.querySelector<HTMLElement>("[data-extension-tools-entry]") ?? undefined);
    if (!target) {
      setIndicator(prev => (prev.opacity === 0 ? prev : { ...prev, opacity: 0 }));
      return;
    }
    const next = { left: target.offsetLeft, width: target.offsetWidth, opacity: 1 };
    setIndicator(prev =>
      prev.left === next.left && prev.width === next.width && prev.opacity === next.opacity
        ? prev
        : next
    );
  }, [activeTool, tools, hasExternalTools]);

  // 首次定位不带过渡：首帧之后（rAF）再让指示块进入过渡态
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (isPresentationMode) return null;
  return (
    <ToolbarContext value={true}>
      <ChromeBar ref={barRef} className="left-1/2 top-3 -translate-x-1/2">
        <span
          aria-hidden
          className={cn(
            "bg-accent-soft pointer-events-none absolute top-1 h-[30px] rounded-[8px]",
            ready &&
              "ease-tau-out transition-[left,width,opacity] duration-[180ms] motion-reduce:transition-opacity"
          )}
          style={{ left: indicator.left, width: indicator.width, opacity: indicator.opacity }}
        />
        {barTools.map((tool, index) => (
          <Fragment key={tool.id}>
            {index > 0 && barTools[index - 1].group !== tool.group && <ChromeGap />}
            <span data-tool-id={tool.id} className="relative z-[1] inline-flex">
              {tool.component ? (
                <tool.component run={payload => board.extensions!.runTool(tool, payload)} />
              ) : null}
            </span>
          </Fragment>
        ))}
        {hasExternalTools && (
          <>
            <ChromeGap />
            <ExtensionTools />
          </>
        )}
      </ChromeBar>
    </ToolbarContext>
  );
});
export default Toolbar;
