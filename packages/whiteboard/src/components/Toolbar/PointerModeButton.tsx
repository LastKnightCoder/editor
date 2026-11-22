import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Menu, cn } from "@tau/ui";
import { ChromeButton } from "../../chrome";
import type { WhiteboardToolContribution } from "../../extensions/api";
import { useBoard } from "../../hooks";

/**
 * 两段共用：底色只由外层整块承担（段内不铺 hover/press 底，避免与激活指示块叠出两色块）；
 * 键盘聚焦画主题焦点环，并抬到相邻段之上以免被盖住。
 */
const SEGMENT =
  "hover:bg-transparent aria-expanded:bg-transparent focus-visible:z-[1] focus-visible:outline-none focus-visible:shadow-[var(--tau-focus-ring)]";

/**
 * 指针 / 抓手 / 文本分体按钮：右段箭头只展开菜单；左段在用别的工具时点击切回上次模式，
 * 已处于该模式时点击同样展开菜单（整块都能点开）。
 * 两段固定宽度（30 + 18），切换模式不改按钮宽度；未激活时悬停整体铺一层浅底，表明是一个控件，
 * 箭头段悬停只提亮颜色。
 */
export default function PointerModeButton({
  modes,
  activeTool,
}: {
  modes: WhiteboardToolContribution[];
  activeTool: string;
}) {
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const arrow = useRef<HTMLButtonElement>(null);
  const activeMode = modes.find(mode => mode.id === activeTool);
  const [lastId, setLastId] = useState(activeMode?.id);
  useEffect(() => {
    if (activeMode) setLastId(activeMode.id);
  }, [activeMode]);

  const current = activeMode ?? modes.find(mode => mode.id === lastId) ?? modes[0];
  const split = modes.length > 1;
  // 菜单开着时按下左段，外点关闭先于 click 生效；按下时记下开合，click 据此切换而不是重开
  const openAtPress = useRef(false);
  const activate = (mode: WhiteboardToolContribution) => {
    if (mode.id !== board.activeTool) board.extensions?.runTool(mode);
  };

  return (
    <span
      data-tool-id={current.id}
      className={cn(
        "relative z-[1] inline-flex items-center rounded-[8px]",
        "ease-tau-out transition-colors duration-150",
        split && !activeMode && "hover:bg-hover has-[[aria-expanded=true]]:bg-hover"
      )}
    >
      <ChromeButton
        label={current.label}
        active={!!activeMode}
        aria-haspopup={split && activeMode ? "menu" : undefined}
        aria-expanded={split && activeMode ? open : undefined}
        onPointerDown={() => {
          openAtPress.current = open;
        }}
        onClick={event => {
          if (!split || !activeMode) return activate(current);
          // 键盘触发的 click 没有 pointerdown，按当前开合切换
          setOpen(!(event.detail > 0 ? openAtPress.current : open));
        }}
        className={cn(split && "rounded-r-[4px]", SEGMENT)}
      >
        <current.icon />
      </ChromeButton>
      {split && (
        <Menu
          open={open}
          onOpenChange={setOpen}
          trigger={
            <ChromeButton
              ref={arrow}
              label="切换指针模式"
              className={cn(
                "w-[18px] rounded-l-[4px] [&_svg]:size-3.5",
                activeMode ? "text-accent-text/70" : "text-ink-3",
                "hover:text-ink-1 aria-expanded:text-ink-1",
                SEGMENT
              )}
            >
              <ChevronDown
                strokeWidth={2.25}
                className={cn(
                  "ease-tau-out transition-transform duration-150 motion-reduce:transition-none",
                  open && "rotate-180"
                )}
              />
            </ChromeButton>
          }
        >
          <Menu.RadioGroup
            value={current.id}
            onValueChange={id => {
              const mode = modes.find(item => item.id === id);
              if (mode) activate(mode);
              setOpen(false);
              arrow.current?.focus({ preventScroll: true });
            }}
          >
            {modes.map(mode => {
              const checked = mode.id === current.id;
              return (
                <Menu.RadioItem
                  key={mode.id}
                  value={mode.id}
                  icon={<mode.icon className={cn("size-4", checked && "text-accent-text")} />}
                  className={cn(checked && "font-medium")}
                >
                  {mode.label}
                </Menu.RadioItem>
              );
            })}
          </Menu.RadioGroup>
        </Menu>
      )}
    </span>
  );
}
