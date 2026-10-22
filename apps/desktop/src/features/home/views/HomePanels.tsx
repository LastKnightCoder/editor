/**
 * 首页面板容器（D-182）：按布局渲染面板，一个可换行的流式容器——wide 占整行，compact 约 340px
 * 起并可伸展，排不满的行伸展填满，同行等高。没有内容的面板（组件返回 null，插件面板正文为空）不占位。
 *
 * 编辑模式：面板内容变淡、不可点，整块可拖动（插入线按紧凑面板左右、整行面板上下判断前后）；
 * 把手获得焦点时方向键移动；没有内容的面板显示为占位卡，照样可以排位置；隐藏的面板在末尾
 * 「已隐藏」区，点一下恢复到末尾，或拖回想放的位置，把面板拖进这里即隐藏。
 */

import {
  createContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { EyeOff, GripVertical, Plus } from "lucide-react";
import { cn } from "@tau/ui";
import type { HomeLayoutEntry } from "@/types/home-layout";
import {
  arrangePanels,
  mergeLayout,
  movePanel,
  setPanelHidden,
  type HomePanelDefinition,
} from "../layout";

/** 首页纸内的滚动容器：懒加载的面板以它为可见性根 */
export const HomeScrollRootContext = createContext<HTMLElement | null>(null);

const DRAG_TYPE = "application/x-tau-home-panel";
const ICON = "size-[15px]";
const CHROME_BUTTON =
  "text-ink-2 hover:bg-hover hover:text-ink-1 grid size-7 place-items-center rounded-[7px]";

type Where = "before" | "after";

export function HomePanels({
  panels,
  layout,
  editing = false,
  onChange,
}: {
  panels: readonly HomePanelDefinition[];
  layout: readonly HomeLayoutEntry[];
  editing?: boolean;
  onChange(next: HomeLayoutEntry[]): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: Where } | null>(null);
  // 键盘移动后把焦点还给同一块面板的把手（重排会让焦点丢失）
  const [focusId, setFocusId] = useState<string | null>(null);
  const { shown, hidden } = arrangePanels(panels, layout);

  useEffect(() => {
    if (!focusId) return;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-home-panel="${focusId}"] [data-home-panel-handle]`)
      ?.focus();
    setFocusId(null);
  }, [focusId, layout]);

  const full = () =>
    mergeLayout(
      panels.map(panel => panel.id),
      layout
    );
  const place = (id: string, target: string, where: Where) =>
    onChange(setPanelHidden(movePanel(full(), id, target, where), id, false));
  const hide = (id: string) => onChange(setPanelHidden(full(), id, true));
  const restore = (id: string) => {
    const last = shown.at(-1);
    if (last) place(id, last.id, "after");
    else onChange(setPanelHidden(full(), id, false));
  };

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  const dragStart = (id: string) => (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  };
  const accepts = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE);

  const panelDragProps = (panel: HomePanelDefinition) => ({
    draggable: true,
    onDragStart: dragStart(panel.id),
    onDragEnd: endDrag,
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragId === panel.id) return setDrop(null);
      const rect = e.currentTarget.getBoundingClientRect();
      const before =
        panel.size === "compact"
          ? e.clientX < rect.left + rect.width / 2
          : e.clientY < rect.top + rect.height / 2;
      const where: Where = before ? "before" : "after";
      if (drop?.id !== panel.id || drop.where !== where) setDrop({ id: panel.id, where });
    },
    onDrop: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_TYPE);
      if (id && id !== panel.id && drop?.id === panel.id) place(id, panel.id, drop.where);
      endDrag();
    },
  });

  const moveByKey = (index: number) => (e: KeyboardEvent) => {
    const step =
      e.key === "ArrowUp" || e.key === "ArrowLeft"
        ? -1
        : e.key === "ArrowDown" || e.key === "ArrowRight"
          ? 1
          : 0;
    const target = step ? shown[index + step] : undefined;
    if (!target) return;
    e.preventDefault();
    const id = shown[index].id;
    place(id, target.id, step < 0 ? "before" : "after");
    setFocusId(id);
  };

  return (
    <>
      <div ref={containerRef} className="flex flex-wrap gap-3">
        {shown.map((panel, index) => {
          const Component = panel.component;
          const dropHere = drop?.id === panel.id ? drop.where : null;
          return (
            <div
              key={panel.id}
              data-home-panel={panel.id}
              className={cn(
                "group/home-panel relative flex min-w-0 flex-col",
                panel.size === "wide" ? "basis-full" : "min-w-[min(340px,100%)] flex-[1_1_340px]",
                editing
                  ? "cursor-grab active:cursor-grabbing"
                  : "has-[>[data-home-panel-content]:empty]:hidden has-[[data-home-panel-body]:empty]:hidden",
                dragId === panel.id && "opacity-40"
              )}
              {...(editing ? panelDragProps(panel) : {})}
            >
              <div
                data-home-panel-content
                inert={editing || undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col empty:hidden [&>*]:flex-1",
                  editing &&
                    "select-none opacity-60 group-has-[[data-home-panel-body]:empty]/home-panel:hidden"
                )}
              >
                <Component />
              </div>
              {editing && (
                <>
                  {/* 没有内容的面板在编辑模式里显示为占位卡，照样可以排位置 */}
                  <div
                    data-home-panel-placeholder
                    className="border-line-2 text-tau-meta text-ink-3 rounded-tau-lg hidden min-h-[72px] flex-1 items-center justify-center border border-dashed group-has-[>[data-home-panel-content]:empty]/home-panel:flex group-has-[[data-home-panel-body]:empty]/home-panel:flex"
                  >
                    {panel.title} · 今天没有内容
                  </div>
                  <div className="outline-line-2 rounded-tau-lg pointer-events-none absolute inset-0 outline-dashed outline-1 outline-offset-2" />
                  <div className="bg-surface shadow-card absolute right-2 top-2 flex items-center gap-0.5 rounded-[9px] p-0.5">
                    <button
                      type="button"
                      data-home-panel-handle
                      aria-label={`移动「${panel.title}」`}
                      title="拖动调整位置，或用方向键移动"
                      onKeyDown={moveByKey(index)}
                      className={cn(CHROME_BUTTON, "cursor-grab")}
                    >
                      <GripVertical className={ICON} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      aria-label={`隐藏「${panel.title}」`}
                      title="隐藏"
                      onClick={() => hide(panel.id)}
                      className={CHROME_BUTTON}
                    >
                      <EyeOff className={ICON} strokeWidth={1.75} />
                    </button>
                  </div>
                </>
              )}
              {dropHere && (
                <span
                  aria-hidden
                  data-home-panel-drop={dropHere}
                  className={cn(
                    "bg-accent pointer-events-none absolute rounded-full",
                    panel.size === "compact"
                      ? cn(
                          "inset-y-0 w-0.5",
                          dropHere === "before" ? "-left-[7px]" : "-right-[7px]"
                        )
                      : cn(
                          "inset-x-0 h-0.5",
                          dropHere === "before" ? "-top-[7px]" : "-bottom-[7px]"
                        )
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <div
          data-home-hidden-panels
          onDragOver={e => {
            if (!accepts(e)) return;
            e.preventDefault();
            setDrop(null);
          }}
          onDrop={e => {
            if (!accepts(e)) return;
            e.preventDefault();
            const id = e.dataTransfer.getData(DRAG_TYPE);
            if (id && !hidden.some(panel => panel.id === id)) hide(id);
            endDrag();
          }}
          className="border-line-2 rounded-tau-lg flex min-h-[52px] flex-wrap items-center gap-2 border border-dashed px-4 py-2.5"
        >
          <span className="text-tau-meta text-ink-3 mr-1">已隐藏</span>
          {hidden.length > 0 ? (
            hidden.map(panel => (
              <button
                key={panel.id}
                type="button"
                draggable
                onDragStart={dragStart(panel.id)}
                onDragEnd={endDrag}
                onClick={() => restore(panel.id)}
                title="点击恢复到末尾，或拖到想放的位置"
                className="border-line-1 text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 ease-tau-out inline-flex cursor-grab items-center gap-1 rounded-[8px] border px-2.5 py-1 transition-[background,color] duration-[160ms]"
              >
                <Plus className="size-[13px]" strokeWidth={1.75} />
                {panel.title}
              </button>
            ))
          ) : (
            <span className="text-tau-meta text-ink-3">把面板拖到这里即可隐藏</span>
          )}
        </div>
      )}
    </>
  );
}
