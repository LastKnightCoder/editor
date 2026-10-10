import { memo, useEffect, useRef, useState } from "react";
import { cn } from "@tau/ui";
import { useBoard, usePresentationState, useReadonly } from "../hooks";
import { SELECT_TOOL_ID } from "../constants/tools";
import type { ElementCreateSpec } from "../extensions/api";

/** 提示胶囊延迟显示的时长：激活工具后 / Esc 取消后 */
const HINT_DELAY_MS = 250;

const resolveHint = (
  spec: ElementCreateSpec,
  options: Readonly<Record<string, unknown>> | null,
  fallbackLabel: string
): readonly string[] => {
  const hint = typeof spec.hint === "function" ? spec.hint(options) : spec.hint;
  if (hint?.length) return hint;
  // 缺省按手势兜底：click = 点击放置，其它（drag / 自定义）= 拖拽绘制
  return [spec.gesture === "click" ? `点击放置${fallbackLabel}` : `拖拽绘制${fallbackLabel}`];
};

const Dot = () => <span aria-hidden className="bg-ink-3/70 size-[3px] rounded-full" />;

/**
 * 创建模式提示胶囊（画布底部居中）：主提示加粗，后缀各段以分隔点相连，末尾提示 Esc 退出。
 * 组件常驻不卸载，隐藏只把 opacity 置 0；显示/隐藏均有 250ms 延时与位移过渡。
 */
const CreateToolHint = memo(function CreateToolHint({ visible }: { visible: boolean }) {
  const board = useBoard();
  const readonly = useReadonly();
  const { isPresentationMode } = usePresentationState();
  const [tool, setTool] = useState(() => ({
    id: board.activeTool,
    options: board.activeToolOptions as Readonly<Record<string, unknown>> | null,
  }));
  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onChange = (id: string, options: Readonly<Record<string, unknown>> | null) =>
      setTool({ id, options });
    board.on("active-tool:change", onChange);
    return () => board.off("active-tool:change", onChange);
  }, [board]);

  const extensions = board.extensions;
  const createTool =
    tool.id === SELECT_TOOL_ID || !extensions ? null : extensions.getCreateTool(tool.id);
  const isActive = !!createTool;

  // 激活创建型工具后延时显示；期间切换工具重新计时，回到非创建工具立即隐藏
  useEffect(() => {
    window.clearTimeout(timer.current);
    setShown(false);
    if (!isActive) return;
    timer.current = window.setTimeout(() => setShown(true), HINT_DELAY_MS);
    return () => window.clearTimeout(timer.current);
  }, [tool.id, isActive]);

  // 创建手势开始即隐藏；被取消（Esc / pointercancel）后延时重新显示（工具仍保持时）
  useEffect(() => {
    const arm = () => {
      window.clearTimeout(timer.current);
      setShown(false);
      timer.current = window.setTimeout(() => {
        // 计时期间工具可能已被切走（取消由工具切换触发时），不再显示
        if (board.extensions?.getCreateTool(board.activeTool)) setShown(true);
      }, HINT_DELAY_MS);
    };
    const onStart = () => {
      window.clearTimeout(timer.current);
      setShown(false);
    };
    board.on("create-gesture:start", onStart);
    board.on("create-gesture:cancel", arm);
    return () => {
      board.off("create-gesture:start", onStart);
      board.off("create-gesture:cancel", arm);
      window.clearTimeout(timer.current);
    };
  }, [board]);

  if (!visible || readonly || isPresentationMode || !createTool) return null;

  const label = extensions!.tools.find(item => item.id === tool.id)?.label ?? "";
  // getCreateTool 仅在 create 规格存在时返回非空，此处 create 必有
  const parts = resolveHint(createTool.definition.create!, tool.options, label);

  return (
    <div
      role="status"
      className={cn(
        "bg-surface text-tau-sm text-ink-3 shadow-lift ring-line-2 ease-tau-out pointer-events-none absolute bottom-4 left-1/2 z-[6] flex h-8 -translate-x-1/2 select-none items-center gap-2 whitespace-nowrap rounded-[10px] px-3 ring-1 transition-[opacity,translate] motion-reduce:translate-y-0",
        shown
          ? "translate-y-0 opacity-100 duration-[160ms]"
          : "translate-y-1 opacity-0 duration-[120ms]"
      )}
    >
      <span className="text-ink-1 font-medium">{parts[0]}</span>
      {parts.slice(1).map(part => (
        <span key={part} className="flex items-center gap-2">
          <Dot />
          <span>{part}</span>
        </span>
      ))}
      <Dot />
      <kbd className="bg-hover font-tau-mono text-ink-2 rounded-[4px] px-[5px] py-0.5 text-[10.5px] leading-none">
        Esc
      </kbd>
      退出
    </div>
  );
});
export default CreateToolHint;
