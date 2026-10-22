/**
 * 首页面板容器（D-182）：按布局渲染面板，一个可换行的流式容器——wide 占整行，compact 约 340px
 * 起并可伸展，排不满的行伸展填满，同行等高。没有内容的面板（组件返回 null，插件面板正文为空）不占位，
 * 上移 / 下移也跳过它。每个面板标题右侧的「⋯」由 HomePanelMenu 提供，末尾可恢复已隐藏的面板。
 */

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, EyeOff, MoreHorizontal } from "lucide-react";
import { Menu, cn } from "@tau/ui";
import type { HomeLayoutEntry } from "@/types/home-layout";
import {
  arrangePanels,
  mergeLayout,
  movePanel,
  setPanelHidden,
  type HomePanelDefinition,
} from "../layout";

interface PanelControls {
  /** 菜单打开时按当前显示出来的面板判断能否移动 */
  neighbors(): { previous?: string; next?: string };
  move(where: "up" | "down"): void;
  hide(): void;
}

const HomePanelContext = createContext<PanelControls | null>(null);

/** 首页纸内的滚动容器：懒加载的面板以它为可见性根 */
export const HomeScrollRootContext = createContext<HTMLElement | null>(null);

const ICON = "size-[15px]";

/** 面板标题行末尾的「⋯」：上移、下移、隐藏；面板悬停或菜单打开时显示 */
export function HomePanelMenu({ className }: { className?: string }) {
  const controls = useContext(HomePanelContext);
  // 受控打开：菜单内容常驻挂载，打开时重新渲染才能按当前显示的面板判断能否移动
  const [open, setOpen] = useState(false);
  if (!controls) return null;
  return (
    <Menu
      align="end"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          aria-label="调整面板"
          title="调整面板"
          className={cn(
            "text-ink-3 hover:bg-hover hover:text-ink-1 ease-tau-out -my-1 -mr-1 ml-auto grid size-6 shrink-0 place-items-center rounded-[7px] font-normal transition-[background,color,opacity] duration-[160ms] [.ml-auto~&]:ml-0",
            "opacity-0 focus-visible:opacity-100 group-hover/home-panel:opacity-100 aria-expanded:opacity-100",
            className
          )}
        >
          <MoreHorizontal className={ICON} strokeWidth={1.75} />
        </button>
      }
    >
      <PanelMenuItems controls={controls} />
    </Menu>
  );
}

function PanelMenuItems({ controls }: { controls: PanelControls }) {
  const { previous, next } = controls.neighbors();
  return (
    <>
      <Menu.Item
        icon={<ArrowUp className={ICON} strokeWidth={1.75} />}
        disabled={!previous}
        onSelect={() => controls.move("up")}
      >
        上移
      </Menu.Item>
      <Menu.Item
        icon={<ArrowDown className={ICON} strokeWidth={1.75} />}
        disabled={!next}
        onSelect={() => controls.move("down")}
      >
        下移
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon={<EyeOff className={ICON} strokeWidth={1.75} />} onSelect={controls.hide}>
        隐藏
      </Menu.Item>
    </>
  );
}

export function HomePanels({
  panels,
  layout,
  onChange,
}: {
  panels: readonly HomePanelDefinition[];
  layout: readonly HomeLayoutEntry[];
  onChange(next: HomeLayoutEntry[]): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { shown, hidden } = arrangePanels(panels, layout);
  const full = () =>
    mergeLayout(
      panels.map(panel => panel.id),
      layout
    );
  // 组件返回 null 的面板外层是空的（插件面板是正文为空），不算「显示出来」
  const renderedIds = () =>
    [
      ...(containerRef.current?.querySelectorAll<HTMLElement>(
        ":scope > [data-home-panel]:not(:empty):not(:has([data-home-panel-body]:empty))"
      ) ?? []),
    ].map(el => el.dataset.homePanel as string);

  const controlsOf = (id: string): PanelControls => {
    const neighbors = () => {
      const ids = renderedIds();
      const index = ids.indexOf(id);
      return index < 0 ? {} : { previous: ids[index - 1], next: ids[index + 1] };
    };
    return {
      neighbors,
      move: where => {
        const { previous, next } = neighbors();
        const target = where === "up" ? previous : next;
        if (target) onChange(movePanel(full(), id, target, where === "up" ? "before" : "after"));
      },
      hide: () => onChange(setPanelHidden(full(), id, true)),
    };
  };

  return (
    <>
      <div ref={containerRef} className="flex flex-wrap gap-3">
        {shown.map(panel => {
          const Component = panel.component;
          return (
            <div
              key={panel.id}
              data-home-panel={panel.id}
              className={cn(
                "group/home-panel flex min-w-0 flex-col empty:hidden has-[[data-home-panel-body]:empty]:hidden [&>*]:flex-1",
                panel.size === "wide" ? "basis-full" : "min-w-[min(340px,100%)] flex-[1_1_340px]"
              )}
            >
              <HomePanelContext.Provider value={controlsOf(panel.id)}>
                <Component />
              </HomePanelContext.Provider>
            </div>
          );
        })}
      </div>
      {hidden.length > 0 && (
        <HiddenPanels hidden={hidden} onShow={id => onChange(setPanelHidden(full(), id, false))} />
      )}
    </>
  );
}

function HiddenPanels({
  hidden,
  onShow,
}: {
  hidden: readonly HomePanelDefinition[];
  onShow(id: string): void;
}): ReactNode {
  return (
    <div className="flex justify-center pt-1">
      <Menu
        align="start"
        trigger={
          <button
            type="button"
            className="text-tau-meta text-ink-3 hover:bg-hover hover:text-ink-1 ease-tau-out rounded-tau-sm px-2.5 py-1 transition-[background,color] duration-[160ms]"
          >
            显示已隐藏的面板（{hidden.length}）
          </button>
        }
      >
        {hidden.map(panel => (
          <Menu.Item key={panel.id} onSelect={() => onShow(panel.id)}>
            {panel.title}
          </Menu.Item>
        ))}
      </Menu>
    </div>
  );
}
